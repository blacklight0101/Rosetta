import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-631, RF-632, RF-603, DEC-80, DEC-135: what a task card says about the legacy behaviour it must
// keep, the data shapes it must handle, and the rule for the default of an open question.

const masker = new SecretMasker();

/** The text as a reader sees it: the escaper's backslashes removed. */
function plain(text: string | undefined): string {
  return (text ?? '').replaceAll('\\', '');
}

function filesOf(
  text = 'Plain text.',
  extra: Partial<HandoffPackage> = {},
): Record<string, string> {
  return { ...renderHandoff(handoffOf(text, undefined, extra), masker) };
}

/** The first task card of the package, from its `## T-nnn` heading. */
function firstCard(files: Record<string, string>): string {
  return plain(files['tasks.md']).split(/^## /mu)[1] ?? '';
}

/** A package whose only task has these fields, building the given requirements. */
function withTask(
  task: Partial<HandoffPackage['content']['tasks'][number]>,
): Partial<HandoffPackage> {
  const base = handoffOf('Plain text.');
  return { content: { ...base.content, tasks: [planTask(task)] } };
}

describe('behaviour to keep on a task card', () => {
  it('RF-631 lists the supported claims the task must keep, each with its card and citation', () => {
    const card = firstCard(filesOf());

    expect(card).toContain('Behaviour to keep:');
    expect(card).toContain(
      '- [FEAT-001](sources.md#feat-001) FEAT-001.c1: Plain text. Citations: src/a`b.cs:1-2',
    );
  });

  it('RF-631 asks for an approval test of each behaviour before the change', () => {
    const card = firstCard(filesOf());

    expect(card).toContain(
      'Approval test before the change: pin FEAT-001.c1 against the legacy code',
    );
    expect((card.match(/Approval test before the change/gu) ?? []).length).toBe(1);
  });

  it('RF-631 lists the behaviours of a feature, a rule, a flow and a screen alike', () => {
    const types = ['FEAT', 'BR', 'FLOW', 'SCRN'] as const;
    const base = handoffOf('Plain text.');
    const requirement = base.content.requirements[0];
    const sources = types.map((type, at) => ({
      ...{ id: `${type}-001`, type, title: type, summary: 'S.', area: 'a' },
      claims: [
        {
          claimId: `${type}-001.c1`,
          text: `Behaviour ${String(at)}.`,
          citations: [{ path: 'src/a.cs', startLine: 1, endLine: 2 }],
          status: 'Supported' as const,
        },
      ],
    }));
    const requirements =
      requirement === undefined
        ? []
        : [{ ...requirement, sources: sources.map((each) => each.id) }];

    const card = firstCard(
      filesOf('Plain text.', {
        content: { ...base.content, requirements, tasks: [planTask()] },
        sources,
      }),
    );

    const listed = [...card.matchAll(/^- \[(\w+-001)\]/gmu)].map((match) => match[1]);
    expect(listed).toEqual(['FEAT-001', 'BR-001', 'FLOW-001', 'SCRN-001']);
  });
});

describe('behaviour to keep, the other cases', () => {
  it('RF-631 lists no behaviour on a task that builds no feature, rule, flow or screen', () => {
    const files = filesOf('Plain text.', {
      ...withTask({ requirements: [] }),
    });

    expect(plain(files['tasks.md'])).not.toContain('Behaviour to keep');
    expect(plain(files['tasks.md'])).not.toContain('Approval test before the change');
  });

  it('RF-603 shows a claim and a citation from the repository as text', () => {
    const hostile = '<img src=x onerror=alert(1)> [x](javascript:alert(1))';
    const files = filesOf(hostile);

    expect(files['tasks.md']).not.toMatch(/<[A-Za-z!/?]/u);
    expect(files['tasks.md']).not.toContain('](javascript');
  });
});

/** The sections of fixtures.md a card links, in order. */
const sections = (card: string): string[] =>
  [...card.matchAll(/\]\(fixtures\.md#([a-z-]+)\)/gu)].map((match) => match[1] ?? '');

describe('data shapes on a task card', () => {
  it('RF-632 a card that adds a limit links the sizes, the depth and the volumes it must handle', () => {
    const files = filesOf(
      'Plain text.',
      withTask({ adds: ['limit'], probes: ['A file of 1 MB.'] }),
    );

    expect(sections(firstCard(files))).toEqual([
      'largest-files',
      'size-by-kind',
      'deepest-paths',
      'data-volumes-stated-by-the-cards',
    ]);
  });

  it('RF-632 a card that adds a parser links the encodings, line endings and names it must handle', () => {
    const files = filesOf(
      'Plain text.',
      withTask({ adds: ['parser'], probes: ['A UTF-16 file.'] }),
    );

    expect(sections(firstCard(files))).toEqual([
      'encodings',
      'line-endings',
      'unusual-file-names',
      'largest-files',
    ]);
  });

  it('RF-632 a card that adds both links each section once', () => {
    const files = filesOf('Plain text.', withTask({ adds: ['limit', 'parser'], probes: ['x'] }));

    const linked = sections(firstCard(files));

    expect(new Set(linked).size).toBe(linked.length);
    expect(linked).toHaveLength(7);
  });
});

describe('data shapes on a task card, the other cases', () => {
  it('RF-632 a card that adds a check or a filter, or nothing, links no data shape', () => {
    for (const adds of [['check'], ['filter'], []] as const) {
      const files = filesOf(
        'Plain text.',
        withTask({ adds, probes: adds.length > 0 ? ['x'] : [] }),
      );

      expect(firstCard(files)).not.toContain('fixtures.md');
    }
  });

  it('RF-632 every section a card links is a heading of fixtures.md', () => {
    const files = filesOf('Plain text.', withTask({ adds: ['limit', 'parser'], probes: ['x'] }));
    const headings = (files['fixtures.md'] ?? '')
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3).toLowerCase().replaceAll(' ', '-'));

    for (const section of sections(firstCard(files))) expect(headings).toContain(section);
  });
});

describe('the default of an open question', () => {
  it('RF-631 open-questions.md states that a default keeps the legacy behaviour', () => {
    const text = plain(filesOf()['open-questions.md']);

    expect(text).toContain('## The rule for a default');
    expect(text).toContain('A default keeps the legacy behaviour');
    expect(text).toContain('a default that would change what users see today is not allowed');
  });

  it('RF-631 a default that would change what users see today is replaced, and the question says so', () => {
    const files = filesOf('Plain text.', {
      briefQuestions: [
        { id: 'a', question: 'Q one?', answer: 'Drop free shipping.', changesLegacy: true },
      ],
      prdQuestions: [{ id: 'prd.rules', question: 'Q two?', answer: 'Keep it.' }],
    });

    const text = plain(files['open-questions.md']);

    expect(text).not.toContain('Drop free shipping');
    expect(text).toContain('Keep the legacy behaviour exactly as the source cards describe it.');
    expect(text).toContain('would change what users see today and is not allowed');
    expect(text).toContain('| prd.rules | Q two? | Keep it. |');
  });

  it('RF-631 a default that keeps the legacy behaviour is written as it is', () => {
    const files = filesOf('Plain text.', {
      briefQuestions: [{ id: 'a', question: 'Q one?', answer: 'Move one part at a time.' }],
    });

    expect(plain(files['open-questions.md'])).toContain(
      '| Q one? | a | Move one part at a time. |',
    );
  });
});

describe('the rule in the build method', () => {
  it('RF-631 the build method states the approval test and the default rules', () => {
    const text = plain(filesOf()['AGENTS.md']);

    expect(text).toContain('## Behaviour to preserve');
    expect(text).toContain('write an approval test');
    expect(text).toContain('before you change it');
    expect(text).toContain('the default keeps the legacy behaviour');
    expect(text).toContain('ask the owner');
  });
});
