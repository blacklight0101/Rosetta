import { describe, expect, it } from 'vitest';
import type { CardType } from '../../../../src/domain/cards/card-vocabulary.js';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { ExcludedClaim } from '../../../../src/domain/planning/plan-sources.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { dangerousIn, renderMarkdown } from '../../../support/render-markdown.js';

// P5-26: the package files are read raw by people and agents, so text is not buried in backslashes
// and entities, the open questions stay short, and the claims left out have a file of their own.
// RF-507, RF-603, RF-604, P3-121 stay: model text is shown as text, nothing is silently dropped.

const masker = new SecretMasker();

/** The text of a real package: ids, parentheses, hyphens, a hash and a snake_case name. */
const realText =
  'Run 20261023-143644-understand: the decisions (ADRs) for non-development C# catalog_brand.';

/** What the owner saw in the real package: an escape that changes nothing in its position. */
const needlessEscape = /\\[-().]|&#58;/;

function claim(index: number, cardType: CardType, citations: number): ExcludedClaim {
  const cardId = `${cardType}-${String(1 + (index % 30)).padStart(3, '0')}`;
  return {
    claimId: `${cardId}.c${String(index)}`,
    cardId,
    status: index % 3 === 0 ? 'Unverified' : 'Rejected',
    cardType,
    area: index % 2 === 0 ? 'catalog' : 'ordering',
    citations,
  };
}

function withClaims(count: number, extra: Partial<HandoffPackage> = {}): HandoffPackage {
  const kinds: readonly CardType[] = ['BR', 'FEAT', 'ENT', 'INT', 'FLOW'];
  const excluded = Array.from({ length: count }, (_, index) =>
    claim(index + 1, kinds[index % kinds.length] ?? 'BR', index % 7),
  );
  return { ...handoffOf('Plain text.'), excluded, ...extra };
}

describe('the package reads as plain text', () => {
  const files = renderHandoff(handoffOf(realText), masker);

  it('P5-26 no file escapes a hyphen, a parenthesis or a dot, or writes a colon as an entity', () => {
    const holding = Object.entries(files)
      .filter(([path, text]) => path.endsWith('.md') && needlessEscape.test(text))
      .map(([path]) => path);

    expect(holding).toEqual([]);
  });

  it('P5-26 the text of the owner review shows as typed', () => {
    const readme = files['README.md'] ?? '';

    expect(readme).toContain('20261023-143644-understand');
    expect(files['open-questions.md']).toBeDefined();
    expect(files['tasks.md']).toContain(realText);
  });

  it('P5-26 the source URL is a plain URL and the README still holds no other link to it', () => {
    const readme = files['README.md'] ?? '';
    const html = renderMarkdown(readme);

    expect(readme).toContain('https://github.com/octo/demo at commit');
    expect(readme).not.toContain('&#58;');
    expect(html.match(/href="https:\/\/github\.com\/octo\/demo"/g)).toHaveLength(1);
  });

  it('RF-507 mutation: a hostile repository address is escaped, not written as a link', () => {
    const hostile = 'https://evil.example/x)[y](javascript:alert(1)';
    const base = handoffOf('Plain text.');
    const written = renderHandoff(
      { ...base, repository: { url: hostile, commitSha: null } },
      masker,
    );

    expect(dangerousIn(written['README.md'] ?? '')).toBeUndefined();
    expect(renderMarkdown(written['AGENTS.md'] ?? '')).not.toContain('href="javascript');
  });
});

describe('open-questions.md stays short and starts with what needs an answer', () => {
  const handoff = withClaims(761, {
    briefQuestions: [{ id: 'migration', question: 'How to move?', answer: 'Step by step.' }],
    openQuestions: [{ cardId: 'OQ-001', question: 'Who cancels?', area: 'catalog' }],
  });
  const files = renderHandoff(handoff, masker);
  const questions = files['open-questions.md'] ?? '';

  it('P5-26 has fewer than 150 lines for 761 claims left out', () => {
    expect(questions.split('\n').length).toBeLessThan(150);
  });

  it('P5-26 lists the brief, PRD and analysis questions before the claims left out', () => {
    const at = (heading: string): number => questions.indexOf(`## ${heading}`);

    expect(at('Planning brief questions that took their default')).toBeGreaterThan(-1);
    expect(at('Planning brief questions that took their default')).toBeLessThan(
      at('Product requirements document questions'),
    );
    expect(at('Product requirements document questions')).toBeLessThan(
      at('Questions from the analysis without an answer'),
    );
    expect(at('Questions from the analysis without an answer')).toBeLessThan(
      at('Claims left out of the package'),
    );
    expect(questions).toContain('| How to move? | migration | Step by step. | none |');
  });

  it('P5-26 summarises the claims by kind, status and area and names the 20 most important', () => {
    expect(questions).toContain('761 claims were left out');
    expect(questions).toContain('| Card kind | Claims left out |');
    expect(questions).toContain('| Status | Claims left out |');
    expect(questions).toContain('| Area | Claims left out |');
    const rows = questions
      .split('\n')
      .filter((line) => /^\| (?:BR|FEAT|ENT|INT|FLOW)-\d+\.c/.test(line));
    expect(rows).toHaveLength(20);
    expect(rows.every((row) => row.includes('| BR |'))).toBe(true);
  });
});

describe('claims-left-out.md holds every claim', () => {
  const handoff = withClaims(761);
  const files = renderHandoff(handoff, masker);
  const questions = files['open-questions.md'] ?? '';

  it('P5-26 links the full list, which holds every claim', () => {
    const full = files['claims-left-out.md'] ?? '';

    expect(questions).toContain('[claims-left-out.md](claims-left-out.md)');
    const rows = full
      .split('\n')
      .filter((line) => /^\| (?:BR|FEAT|ENT|INT|FLOW)-\d+\.c/.test(line));
    expect(rows).toHaveLength(761);
    for (const each of handoff.excluded) expect(full).toContain(`| ${each.claimId} |`);
  });

  it('P5-26 the README reading order lists the full list after the open questions', () => {
    const readme = files['README.md'] ?? '';

    expect(readme).toMatch(
      /\[Open questions\]\(open-questions\.md\)\n\d+\. \[Claims left out\]\(claims-left-out\.md\)/,
    );
  });

  it('P5-26 says so when no claim was left out, in both files', () => {
    const none = renderHandoff({ ...handoff, excluded: [] }, masker);

    expect(none['open-questions.md']).toContain('No claim was left out.');
    expect(none['claims-left-out.md']).toContain('No claim was left out.');
  });

  it('RF-507 hostile claim text and area stay text in both files', () => {
    const hostile = '<script>alert(1)</script> [x](javascript:alert(1)) | y\n# Heading `tick`';
    const one: ExcludedClaim = { ...claim(1, 'BR', 3), area: hostile };
    const written = renderHandoff({ ...handoff, excluded: [one] }, masker);

    for (const name of ['open-questions.md', 'claims-left-out.md']) {
      const text = written[name] ?? '';
      expect(dangerousIn(text)).toBeUndefined();
      expect(renderMarkdown(text)).not.toMatch(/<h1[^>]*>\s*Heading/);
      const row = text.split('\n').find((line) => line.startsWith('| BR-')) ?? '';
      expect(row.replaceAll('\\|', '').split('|')).toHaveLength(8);
    }
  });
});
