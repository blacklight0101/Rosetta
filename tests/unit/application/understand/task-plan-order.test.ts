import { describe, expect, it } from 'vitest';
import type { PriorCard } from '../../../../src/application/ports/prior-cards.js';
import { planTasks } from '../../../../src/application/understand/task-plan.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import type { CodeMap } from '../../../../src/domain/code-map/code-map.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-210 (P8-124, DEC-216): the reading order holds on a re-run of a subset of areas and on a plan
// made without a scan. A re-run reads the areas of the answered questions in the same app-first order
// as a first run; a plan without a scan gives the order of a scan that knows no entry point and no size.

const project = { userId: 'u-1', projectId: 'p-1' };
const runKey = '20261012-100000-understand';

const files = [
  entry('Docs/guide.cs', 1_200),
  entry('Small/OrdersController.cs', 100, { artefactKinds: ['controller'] }),
  entry('Big/HomeController.cs', 900, { artefactKinds: ['controller'] }),
  entry('Setup/install.cs', 50),
  entry('Skipped/OtherController.cs', 5_000, { artefactKinds: ['controller'] }),
];

function areaOf(name: string): Area {
  const own = files.filter((file) => file.path.startsWith(`${name}/`));
  return {
    name,
    files: own.map((file) => file.path),
    estimatedTokens: own.reduce((sum, file) => sum + file.estimatedTokens, 0),
    mapLevel: 'coarse',
    origin: 'folder',
  };
}

// The code map's order is the opposite of the reading order: the apps come last.
const names = ['Docs', 'Setup', 'Skipped', 'Small', 'Big'] as const;
const areas = names.map(areaOf);

function codeMapOf(listed: CodeMap['files']): CodeMap {
  return {
    schemaVersion: 1,
    source: { owner: 'o', repo: 'shop', commitSha: 'c'.repeat(40), subpath: '' },
    files: listed,
    areas,
    symbols: [],
    links: [],
    sqlStatements: [],
    entities: [],
    languagePacks: [],
  };
}

const card = (id: string, area: string): PriorCard => ({
  ...{ id, type: 'OQ', title: 'A question', area, claims: [] },
  ...{ question: `Why ${id}?`, questionState: 'Open' },
});

const answered = (cardId: string) => ({
  ...{ cardId, runKey, question: `Why ${cardId}?`, context: 'a.cs:1-2 x' },
  answer: 'Because.',
});

const rerun = {
  answers: {
    answeredQuestions: () =>
      Promise.resolve([answered('OQ-001'), answered('OQ-002'), answered('OQ-003')]),
  },
  cards: {
    cardsOf: () =>
      Promise.resolve([card('OQ-001', 'Docs'), card('OQ-002', 'Small'), card('OQ-003', 'Big')]),
    markAnswered: () => Promise.resolve([]),
  },
};

async function plannedNames(input: {
  readonly scanned?: { readonly codeMap: CodeMap };
  readonly withAnswers?: boolean;
  readonly named?: readonly string[];
}): Promise<readonly string[]> {
  const planned = await planTasks({
    areas,
    ...(input.scanned === undefined ? {} : { scanned: input.scanned }),
    options: {
      cloudConsent: false,
      ...(input.withAnswers === true ? { withAnswers: true } : {}),
      ...(input.named === undefined ? {} : { areas: input.named }),
    },
    project,
    rerun,
  });
  return planned.ok ? planned.value.tasks.map((task) => task.area.name) : [];
}

describe('RF-210 the reading order of a re-run with answers (DEC-216)', () => {
  const scanned = { codeMap: codeMapOf(files) };

  it('RF-210 keeps the app-first order for the areas of the answered questions', async () => {
    const first = await plannedNames({ scanned });
    const again = await plannedNames({ scanned, withAnswers: true });

    expect(first).toEqual(['Skipped', 'Big', 'Small', 'Docs', 'Setup']);
    expect(again).toEqual(['Big', 'Small', 'Docs']);
  });

  it('RF-210 keeps the app-first order when the request names a subset of those areas', async () => {
    const again = await plannedNames({ scanned, withAnswers: true, named: ['Docs', 'Big'] });

    expect(again).toEqual(['Big', 'Docs']);
  });
});

describe('RF-210 the reading order of a plan without a scan (DEC-216)', () => {
  it('RF-210 gives every area the same standing, so the code map order is kept', async () => {
    expect(await plannedNames({})).toEqual(['Docs', 'Setup', 'Skipped', 'Small', 'Big']);
  });

  it('RF-210 gives the order of a scan that knows no entry point and no size', async () => {
    const blind = { codeMap: codeMapOf([]) };

    expect(await plannedNames({})).toEqual(await plannedNames({ scanned: blind }));
  });

  it('RF-210 keeps the code map order on a re-run without a scan', async () => {
    expect(await plannedNames({ withAnswers: true })).toEqual(['Docs', 'Small', 'Big']);
  });
});
