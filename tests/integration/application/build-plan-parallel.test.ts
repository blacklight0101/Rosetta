import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  cardsOf,
  packageOf,
  packageWithoutEntities,
  plain,
} from '../../support/plan-method-harness.js';
import { plannerAnswering } from '../../support/planner-answering.js';
import { invariant, scenario } from '../../support/task-card-fixtures.js';

// RF-634, RF-636, ADR-018, DEC-135: a plan whose cards cannot collide. Structure tests over real
// packages written from the planner's recorded answer and from answers the planner could give.

const aiAssisted = { buildMethod: { aiAssisted: true } } as const;
const kinds = ['error code', 'migration number', 'configuration key', 'port'] as const;
const identifierLine = /^- (?:error code|migration number|configuration key|port) (\S+): /gmu;

function task(title: string, extra: object): object {
  return {
    ...{ title, phase: 1, requirements: [1], acceptanceCriteria: [scenario] },
    ...{ invariant, riskClass: 'none' },
    ...extra,
  };
}

function needing(purpose: string): object {
  return { needs: [{ kind: 'error code', purpose }] };
}

/** The values a card lists under its shared identifiers. */
function identifiersOf(card: string): string[] {
  return [...card.matchAll(identifierLine)].map((match) => match[1] ?? '');
}

function segments(path: string): string[] {
  return path
    .toLowerCase()
    .split('/')
    .filter((part) => part !== '' && part !== '.');
}

/** Whether a file or folder of one card contains, or is contained in, one of the other. */
function overlap(left: readonly string[], right: readonly string[]): boolean {
  return left.some((one) =>
    right.some((other) => {
      const a = segments(one);
      const b = segments(other);
      const shared = Math.min(a.length, b.length);
      return a.slice(0, shared).join('/') === b.slice(0, shared).join('/');
    }),
  );
}

function filesOf(card: string): string[] {
  const section = /Expected files:\n\n((?:- .+\n)+)/u.exec(card)?.[1] ?? '';
  return section
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.slice(2));
}

/** The groups of a phase's roadmap section, each as the card ids in it. */
function groupsOf(roadmap: string, phase: number): string[][] {
  const heading = `Phase ${String(phase)}\n`;
  const section = roadmap.split(/^## /mu).find((part) => part.startsWith(heading)) ?? '';
  return section
    .split('\n')
    .filter((line) => /^- Group \d+: /u.test(line))
    .map((line) => line.match(/T-\d{3}/gu) ?? []);
}

describe('RF-634 identifiers allocated by the plan', () => {
  it('RF-634 a plan with two cards that need an error code gives them two different codes', async () => {
    const recording = plannerAnswering([
      task('Orders', needing('order not found')),
      task('Payments', needing('payment declined')),
    ]);

    const cards = cardsOf(await packageOf({}, recording));

    expect(identifiersOf(cards[0] ?? '')).toEqual(['ERR-001']);
    expect(identifiersOf(cards[1] ?? '')).toEqual(['ERR-002']);
  });

  it('RF-634 no identifier is allocated twice, of any kind, across a larger plan', async () => {
    const tasks = Array.from({ length: 12 }, (_, at) =>
      task(`Card ${String(at)}`, {
        needs: kinds.slice(0, (at % 4) + 1).map((kind) => ({ kind, purpose: `use ${String(at)}` })),
      }),
    );

    const files = await packageOf({}, plannerAnswering(tasks));

    const allocated = cardsOf(files).flatMap(identifiersOf);
    expect(allocated).toHaveLength(30);
    expect(new Set(allocated).size).toBe(allocated.length);
  });

  it('RF-634 the recorded plan lists the files and identifiers of each card', async () => {
    const cards = cardsOf(await packageOf({}));

    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card).toMatch(/\nExpected files:\n\n- \S/u);
      expect(card).toMatch(
        /\nShared identifiers \(allocated by the plan; use only these\):\n\n- /u,
      );
    }
  });
});

const overlappingCards = [
  task('Orders', { files: ['src/orders/'] }),
  task('Order totals', { files: ['SRC/Orders/Total.ts'] }),
  task('Customers', { files: ['src/customers/'] }),
  task('Order mails', { files: ['src\\orders\\mail.ts', 'src/mail/'] }),
  task('Mail templates', { files: ['./src/mail/templates'] }),
];

describe('RF-634 overlapping cards are ordered, never in one parallel group', () => {
  it('RF-634 the later card of two that overlap depends on the earlier, as a link', async () => {
    const cards = cardsOf(await packageWithoutEntities({}, plannerAnswering(overlappingCards)));

    // T-001 and T-002 are the skeleton and the harness (the plan has no data, P6-27); the planner's cards start at T-003.
    expect(cards[0]).not.toMatch(/\nDepends on:.*\[T-00[3-9]\]/u);
    expect(cards[1]).toMatch(/\nDepends on:.*\[T-003\]\(tasks\.md#t-003\)\n/u);
    expect(cards[2]).not.toMatch(/\nDepends on:.*\[T-00[3-9]\]/u);
    expect(cards[3]).toMatch(/\nDepends on:.*\[T-003\]\(tasks\.md#t-003\)\n/u);
    expect(cards[4]).toMatch(/\nDepends on:.*\[T-006\]\(tasks\.md#t-006\)\n/u);
  });
});

describe('RF-634 the parallel groups of the roadmap', () => {
  it('RF-634 the roadmap lists the groups, and no group holds two cards with overlapping files', async () => {
    const files = await packageWithoutEntities({}, plannerAnswering(overlappingCards));

    const listed = new Map(cardsOf(files).map((card) => [card.slice(0, 5), filesOf(card)]));
    const groups = groupsOf(plain(files['roadmap.md']), 1);
    // T-001 and T-002 are the skeleton and the harness; the planner's cards are T-003 to T-007; T-010 is the verification matrix card of the phase.
    expect(groups).toEqual([
      ['T-001'],
      ['T-002', 'T-003', 'T-005'],
      ['T-004', 'T-006'],
      ['T-007'],
      ['T-010'],
    ]);
    for (const group of groups) {
      for (const [at, one] of group.entries()) {
        for (const other of group.slice(at + 1)) {
          expect(overlap(listed.get(one) ?? [], listed.get(other) ?? [])).toBe(false);
        }
      }
    }
  });
});

describe('RF-634 the parallel groups of each phase', () => {
  it('RF-634 the groups of each phase stand on their own', async () => {
    const recording = plannerAnswering([
      task('Orders', { files: ['src/orders/'] }),
      task('Reports', { phase: 2, files: ['src/reports/'] }),
      task('Report totals', { phase: 2, files: ['src/orders/total.ts'] }),
    ]);

    const files = await packageWithoutEntities({}, recording);

    const roadmap = plain(files['roadmap.md']);
    expect(groupsOf(roadmap, 1)).toEqual([['T-001'], ['T-002', 'T-003'], ['T-008']]);
    expect(groupsOf(roadmap, 2)).toEqual([['T-004', 'T-005'], ['T-006'], ['T-007'], ['T-009']]);
    expect(cardsOf(files)[2]).toMatch(/\nDepends on:.*\[T-003\]\(tasks\.md#t-003\)\n/u);
  });

  it('RF-634 cards that overlap are ordered whether or not the build is AI-assisted', async () => {
    const files = await packageOf(aiAssisted, plannerAnswering(overlappingCards));

    const off = { buildMethod: { aiAssisted: false } } as const;
    const unassisted = await packageOf(off, plannerAnswering(overlappingCards));
    for (const each of [files, unassisted]) {
      expect(groupsOf(plain(each['roadmap.md']), 1)).toHaveLength(7);
    }
  });
});

describe('RF-636 agent operations', () => {
  it('RF-636 AGENTS.md of an AI-assisted build has an operations section', async () => {
    const agents = plain((await packageOf(aiAssisted))['AGENTS.md']);

    expect(agents).toMatch(/^## Operations$/mu);
    expect(agents).toContain('Merge one pull request at a time');
    expect(agents).toContain('register of known flaky tests');
  });

  it('RF-636 a build that is not AI-assisted has no AGENTS.md', async () => {
    const files = await packageOf({ buildMethod: { aiAssisted: false } });

    expect(Object.keys(files)).not.toContain('AGENTS.md');
  });
});

describe('RF-634 the planner prompt asks for it', () => {
  it('RF-634 the prompt asks for the files, the needed identifiers and the cards a card waits for', async () => {
    const prompt = await readFile('prompts/planner/package.v11.md', 'utf8');

    expect(prompt).toContain('`files`');
    expect(prompt).toContain('`needs`');
    expect(prompt).toContain('`dependsOn`');
    for (const kind of kinds) expect(prompt).toContain(kind);
    expect(prompt).toContain('never write the value');
    expect(prompt).toContain('Paths are literal');
    expect(prompt).toContain('write no patterns');
  });
});
