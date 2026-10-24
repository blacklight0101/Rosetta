import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { transitionClaim } from '../../../../src/domain/cards/card.js';
import {
  SecretMasker,
  type TextMasker,
} from '../../../../src/infrastructure/guards/secret-masker.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { cardsOf, fileOf, writeCards } from '../../../support/card-output-harness.js';

// P3-127: a masked secret never breaks the quoting of a card file. The header is quoted
// (`\"` for a quote) and the body escaped (`\[`); masking the finished text again read the escaped
// marker as a value and ate the backslash of the closing `\"`, so the header no longer parsed.

const fake = 'FAKE-pw-0000-not-a-real-secret';
const quotedString = `with "User Id=sa;Password=${fake}" inline`;
const verdict = { step: 'judgement', model: 'fake-model', at: '2026-10-12T10:00:00.000Z' } as const;

async function cardFile(masker: TextMasker = new SecretMasker()) {
  const claim = { text: quotedString, citations: [{ path: 'a/b.cs', startLine: 1, endLine: 2 }] };
  const cards = cardsOf([
    { agentTaskId: 't', area: 'orders', drafts: [draftOf({ claims: [claim] })] },
  ]);
  const first = cards[0];
  if (first === undefined) throw new Error('fixture');
  const judged = transitionClaim(first, `${first.id}.c1`, 'Rejected', {
    ...verdict,
    reason: quotedString,
  });
  if (!judged.ok) throw new Error('fixture');
  const { writer } = await writeCards([judged.value], masker);
  return { writer, file: fileOf(writer, 'cards/FEAT/FEAT-001.md') };
}

function header(file: string): unknown {
  return parse(file.split('\n---\n')[0]?.replace(/^---\n/, '') ?? '');
}

describe('P3-127 a masked secret keeps the quoting of a card file', () => {
  it('the header parses and the reason keeps its quotes around the masked value', async () => {
    const { file } = await cardFile();
    const text = JSON.stringify(header(file));

    expect(text).toContain('Password=[MASKED:');
    expect(text).toMatch(/\]\\" inline/);
  });

  it('the Markdown body keeps the escaped marker and the closing quote', async () => {
    const { file } = await cardFile();
    const body = file.split('\n---\n').slice(1).join('\n---\n');

    expect(body).toContain(String.raw`Password=[MASKED:connection-string]" inline`);
  });

  it('RF-141 no fake secret is in any written file', async () => {
    const { writer } = await cardFile();

    for (const [path, text] of writer.files)
      expect([path, text.includes(fake)]).toEqual([path, false]);
  });

  it('the rendered text is not masked a second time', async () => {
    let calls = 0;
    const counting: TextMasker = {
      mask(text) {
        calls += 1;
        return new SecretMasker().mask(text);
      },
    };
    const seen: string[] = [];
    const spying: TextMasker = {
      mask(text) {
        seen.push(text);
        return counting.mask(text);
      },
    };
    await cardFile(spying);

    expect(calls).toBeGreaterThan(0);
    const escapedMarker = new RegExp(String.raw`\\(?:u005b|\[)MASKED`);
    expect(seen.filter((t) => t.startsWith('---') && escapedMarker.test(t))).toEqual([]);
  });
});
