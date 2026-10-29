import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrationStrategyInfo } from '../../../src/domain/planning/migration-strategy.js';
import type { BriefAnswers } from '../../../src/domain/planning/planning-brief.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { createPlanHarness } from '../../support/plan-harness.js';

// RF-605, RF-645, RF-622, DEC-184: with an own answer typed, every file of the package leads with
// the owner's answer, and the enumerated default (the style, the strategy) appears only labelled as
// the reference Rosetta's checks use, never as the chosen style or strategy. The planner is the
// recorded planner-package.json; no model is called.

const typed = {
  principles: 'Pair on every change to a permission rule.',
  architecture: 'Cells, one per region, each with its own database.',
  migration: 'Move one module a week behind a feature flag.',
  buildMethod: 'A vendor builds it and our team reviews every change.',
} as const;
/** The label of the default: the default style or strategy and the one check of Rosetta that uses it. */
const label =
  /the default (style|strategy),? (and )?(is )?the reference Rosetta's (dependency|strategy-fit) check uses/u;
const strangler = migrationStrategyInfo['strangler-fig'];
/**
 * Text that names the default style or strategy, states the default strategy's ordering, or holds
 * what only a strangler fig prescribes (a routing layer or facade in front of both systems).
 */
const defaults = [
  'Layered (N-tier)',
  strangler.title,
  strangler.ordering,
  'routing',
  'routed',
  'facade',
];
/** What a cut-over card of a catalogue strategy prescribes. */
const strategySpecific = /routing|routed|facade|strangler|frozen for writes|old way/iu;

let dataDir = '';

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-typed-ref-'));
});

afterEach(() => rm(dataDir, { recursive: true, force: true }));

async function packageOf(answers: BriefAnswers): Promise<Record<string, string>> {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const harness = await createPlanHarness(dataDir, recording);
  await harness.understandRun({ cards: planCards(), questions: planQuestions });
  await harness.saveBrief(answers);
  const run = await harness.plan();
  expect(run.endState).toBe('Completed');
  const files = await harness.handoffOf(run);
  return Object.fromEntries(
    Object.entries(files).map(([path, text]) => [path, text.replaceAll('\\', '')]),
  );
}

/** An option of a decision record that is not marked as the chosen one. */
const unchosenOption = (path: string, line: string): boolean =>
  path.startsWith('decisions/') && line.startsWith('- ') && !line.includes('(chosen)');

/** Each line that names the default without the reference label, as `path: line`. */
function unlabelled(files: Readonly<Record<string, string>>): string[] {
  return Object.entries(files).flatMap(([path, text]) =>
    text
      .split('\n')
      .filter((line) => defaults.some((each) => line.includes(each)))
      .filter((line) => !label.test(line) && !unchosenOption(path, line))
      .map((line) => `${path}: ${line}`),
  );
}

const allFour: BriefAnswers = {
  chosen: { principles: 'typed', architecture: 'typed', migration: 'typed', buildMethod: 'typed' },
  typed,
};
const agentBuild: BriefAnswers = {
  typed: {
    principles: typed.principles,
    architecture: typed.architecture,
    migration: typed.migration,
  },
  buildMethod: { aiAssisted: true, agentTool: { kind: 'claude-code' } },
};

describe('RF-645 DEC-184 the package never presents the default as the chosen style or strategy', () => {
  it('RF-645 with all four answers typed, no file names the default without the reference label', async () => {
    const files = await packageOf(allFour);

    expect(unlabelled(files)).toEqual([]);
  });

  it('RF-612 RF-645 in an agent build, AGENTS.md and the other files label the default as the reference too', async () => {
    const files = await packageOf(agentBuild);

    expect(Object.keys(files)).toContain('AGENTS.md');
    expect(unlabelled(files)).toEqual([]);
  });

  it('RF-622 RF-645 the TRD states the typed architecture and migration answers', async () => {
    const files = await packageOf(allFour);

    expect(files['trd.md']).toContain(typed.architecture);
    expect(files['trd.md']).toContain(typed.migration);
  });

  it('RF-645 the files lead with the own answer before the reference', async () => {
    const files = await packageOf(allFour);

    for (const [path, own, reference] of [
      ['architecture.md', typed.architecture, 'Layered (N-tier)'],
      ['trd.md', typed.architecture, 'Layered (N-tier)'],
      ['trd.md', typed.migration, strangler.title],
      ['roadmap.md', typed.migration, strangler.title],
    ] as const) {
      const text = files[path] ?? '';
      expect(text.indexOf(own), `${path} ${own}`).toBeGreaterThan(-1);
      expect(text.indexOf(own), `${path} ${own}`).toBeLessThan(text.indexOf(reference));
    }
  });

  it('RF-608 the decision records name the default only as the reference, never as the nearest style', async () => {
    const files = await packageOf(allFour);

    const records = Object.entries(files).filter(([path]) => path.startsWith('decisions/'));
    expect(records.map(([, text]) => text).join('\n')).not.toContain('nearest');
    expect(records.map(([, text]) => text).join('\n')).toMatch(label);
  });
});

describe('RF-645 DEC-184 the label names the one check that uses the default', () => {
  it('RF-645 the style and the strategy name the default and their check, never the checks in general', async () => {
    const files = await packageOf(allFour);

    const all = Object.values(files).join('\n');
    expect(all).not.toContain("the reference Rosetta's checks use");
    expect(files['architecture.md']).toMatch(
      /Layered \(N-tier\) \(\[ADR-\d{3}\]\([^)]*\)\), the default style, is the reference Rosetta's dependency check uses, not the chosen style: /u,
    );
    expect(files['roadmap.md']).toMatch(
      /Strangler Fig \(\[ADR-\d{3}\]\([^)]*\)\), the default strategy, is the reference Rosetta's strategy-fit check uses, not the chosen strategy: /u,
    );
  });
});

describe('RF-645 DEC-184 the fixed task cards follow the own answers', () => {
  it('RF-645 DEC-184 the cut-over card follows the own migration answer and prescribes no strategy', async () => {
    const files = await packageOf(allFour);

    const tasks = files['tasks.md'] ?? '';
    const cutOver = tasks.slice(tasks.indexOf('**Cut over from the legacy system'));
    expect(cutOver).toMatch(/owner's own migration answer in ADR-\d{3}/u);
    expect(tasks).not.toMatch(strategySpecific);
  });

  it('RF-645 DEC-184 the skeleton card points to the own architecture answer, not to the layers of a style', async () => {
    const files = await packageOf(allFour);

    expect(files['tasks.md']).toMatch(/owner's own architecture answer in ADR-\d{3}/u);
    expect(files['tasks.md']).not.toContain('layers of the chosen architecture style');
  });
});

describe('RF-605 DEC-184 the README principles', () => {
  it('RF-605 the README lists the typed principle with the principles and practices', async () => {
    const files = await packageOf(allFour);

    const readme = files['README.md'] ?? '';
    const section = readme.slice(readme.indexOf('## Principles and practices'));
    expect(section).toContain(`- The owner's own principle: ${typed.principles}`);
  });
});

describe('RF-608 DEC-184 a brief with no typed answer', () => {
  it('RF-608 a brief with no typed answer names the default as before, without the label', async () => {
    const files = await packageOf({});

    expect(Object.values(files).join('\n')).not.toContain(label);
    expect(files['architecture.md']).toContain('Architecture style: **Layered (N-tier)**');
  });
});
