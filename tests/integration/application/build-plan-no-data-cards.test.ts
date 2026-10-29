import { beforeAll, describe, expect, it } from 'vitest';
import {
  claudeCodeMethod,
  singleFileRun,
  type MethodRun,
} from '../../support/single-file-method-run.js';

// P6-27, RF-610, RF-623, RF-630, DEC-190, ADR-008: a plan run of a single-file application, whose
// understand run has no ENT claim and whose data model has no table. The planner replays
// tests/recordings/fake/planner-single-file.json; no provider is called. The package keeps the
// skeleton, harness and cut-over cards and has no data-access or data-migration card.

const titles = {
  skeleton: 'Set up the solution skeleton and continuous integration in the chosen stack',
  access: 'Build the data-access layer on the chosen database',
  harness: 'Build the approval-test harness that runs the legacy behaviour',
  migration: 'Migrate the legacy data into the target tables with a row-count check',
  cutOver: 'Cut over from the legacy system to the new system',
};

interface Card {
  readonly id: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
}

/** The cards of `tasks.md` with the ids they wait for. */
function cardsOf(tasks: string): Card[] {
  return tasks
    .split('\n## ')
    .slice(1)
    .map((section) => {
      const lines = section.split('\n');
      const depends = lines.find((line) => line.startsWith('Depends on: ')) ?? '';
      return {
        id: lines[0] ?? '',
        title: /^\*\*(.+)\*\*$/u.exec(lines[2] ?? '')?.[1] ?? '',
        dependsOn: depends.match(/\[T-\d{3}\]/gu)?.map((link) => link.slice(1, -1)) ?? [],
      };
    });
}

let run: MethodRun;
let cards: Card[];
beforeAll(async () => {
  run = await singleFileRun(claudeCodeMethod);
  cards = cardsOf(run.files['tasks.md'] ?? '');
}, 60_000);

describe('the package of a run with no data model', () => {
  it('RF-612 ADR-008 the run completes from the recorded planner answer only', () => {
    expect(run.endState).toBe('Completed');
    expect(run.providers.every((task) => task.startsWith('planner'))).toBe(true);
  });

  it('P6-27 RF-610 has the skeleton, the harness and the cut-over card and no data card', () => {
    const names = cards.map((card) => card.title);

    expect(names).toEqual(
      expect.arrayContaining([titles.skeleton, titles.harness, titles.cutOver]),
    );
    expect(names).not.toContain(titles.access);
    expect(names).not.toContain(titles.migration);
    expect(names[0]).toBe(titles.skeleton);
    // RF-635: the cut-over card is at a risk, so the security review waits for it.
    const cutOver = cards.find((card) => card.title === titles.cutOver);
    const review = cards.find((card) => card.title.startsWith('Review the security'));
    expect(review?.dependsOn).toContain(cutOver?.id);
  });

  it('P6-27 no card depends on a card the package does not have, and the ids run on without a gap', () => {
    const ids = new Set(cards.map((card) => card.id));

    expect(cards.map((card) => card.id)).toEqual(
      cards.map((_, at) => `T-${String(at + 1).padStart(3, '0')}`),
    );
    for (const card of cards) for (const on of card.dependsOn) expect(ids.has(on)).toBe(true);
  });

  it('P6-27 every other file names only cards that tasks.md has', () => {
    const ids = new Set(cards.map((card) => card.id));

    for (const [path, text] of Object.entries(run.files)) {
      for (const id of text.match(/T-\d{3}/gu) ?? []) {
        expect(ids.has(id), `${path} names ${id}`).toBe(true);
      }
    }
  });
});

describe('the files of the package of a run with no data model', () => {
  it('P6-27 RF-630 the roadmap counts the cards the package has and holds no empty phase', () => {
    const roadmap = run.files['roadmap.md'] ?? '';
    const phases = roadmap.split('\n## Phase ').slice(1);

    expect(phases.length).toBeGreaterThan(0);
    for (const phase of phases) {
      expect(phase).toMatch(/Task cards: \[T-\d{3}\]/u);
      expect(phase).toContain(`in ${String(cards.length)} task cards`);
    }
  });

  it('P6-27 RF-623 data-model.md and entity-mapping.md say there is no table and name no data card', () => {
    const text = `${run.files['data-model.md'] ?? ''}\n${run.files['entity-mapping.md'] ?? ''}`;

    expect(text).toContain('no table was derived');
    expect(text).toContain('The planner mapped no entity.');
    expect(text).not.toContain('data-access layer');
    expect(text).not.toContain('Migrate the legacy data');
  });
});
