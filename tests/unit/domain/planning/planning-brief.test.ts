import { describe, expect, it } from 'vitest';
import { noClaimVerbs } from '../../../../src/domain/planning/claim-verbs.js';
import { noStackData } from '../../../../src/domain/planning/stack-data.js';
import type { Catalogue } from '../../../../src/domain/planning/catalogue.js';
import {
  briefProblems,
  buildBrief,
  isBriefOutOfDate,
  sameBrief,
  stackLayers,
} from '../../../../src/domain/planning/planning-brief.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { completeEntries, sampleEntry } from '../../../support/catalogue-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-605, RF-606, RF-610, DEC-74, DEC-80: the planning brief takes the default of every question
// that was not answered and lists it; a brief saved after a finished package began is out of date.

const entries = [
  ...completeEntries().filter((entry) => entry.id !== 'method-entry'),
  sampleEntry('tdd', 'method', true),
  sampleEntry('solid', 'design-principles', true),
  sampleEntry('mikado', 'modernisation'),
];
const catalogue: Catalogue = {
  version: 3,
  sha256: 'a'.repeat(64),
  entries,
  styles: [],
  stack: noStackData,
  claimVerbs: noClaimVerbs,
};

describe('buildBrief: no answers', () => {
  it('RF-605 a brief with no answers takes the default of every question and lists them all', () => {
    const brief = buildBrief({}, catalogue);

    expect(brief.principles).toEqual(['solid', 'tdd']);
    expect(brief.migration).toBe('strangler-fig');
    expect(brief.architecture).toEqual({ style: 'layered', recommended: [], evidence: [] });
    expect(brief.buildMethod).toEqual({ aiAssisted: false });
    expect(brief.stack).toEqual([]);
    expect(brief.context).toEqual({
      teamSize: null,
      experience: null,
      deadline: null,
      keepIntegrations: [],
      dataMigration: null,
    });
    expect(brief.catalogueVersion).toBe(3);
    expect(brief.defaulted).toEqual([
      'principles',
      'architecture',
      'migration',
      ...stackLayers.map((layer) => `stack.${layer}`),
      'context.teamSize',
      'context.experience',
      'context.deadline',
      'context.keepIntegrations',
      'context.dataMigration',
      'buildMethod',
    ]);
  });
});

describe('buildBrief: answers', () => {
  it('RF-605 an answered question is kept and not listed as defaulted', () => {
    const brief = buildBrief(
      {
        principles: ['tdd', 'mikado'],
        architecture: {
          style: 'hexagonal',
          recommended: ['hexagonal', 'clean'],
          evidence: ['C-1'],
        },
        migration: 'rewrite',
        stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
        context: { teamSize: 4, keepIntegrations: [] },
        buildMethod: { aiAssisted: true },
      },
      catalogue,
    );

    expect(brief.principles).toEqual(['mikado', 'tdd']);
    expect(brief.architecture).toEqual({
      style: 'hexagonal',
      recommended: ['hexagonal', 'clean'],
      evidence: ['C-1'],
    });
    expect(brief.migration).toBe('rewrite');
    expect(brief.context.teamSize).toBe(4);
    expect(brief.buildMethod.aiAssisted).toBe(true);
    expect(brief.defaulted).not.toContain('principles');
    expect(brief.defaulted).not.toContain('architecture');
    expect(brief.defaulted).not.toContain('migration');
    expect(brief.defaulted).not.toContain('stack.database');
    expect(brief.defaulted).toContain('stack.testing');
    expect(brief.defaulted).not.toContain('context.teamSize');
    expect(brief.defaulted).not.toContain('context.keepIntegrations');
    expect(brief.defaulted).toContain('context.deadline');
    expect(brief.defaulted).not.toContain('buildMethod');
  });
});

describe('buildBrief: edge answers', () => {
  it('RF-605 an answer equal to the default is still an answer', () => {
    const brief = buildBrief(
      { migration: 'strangler-fig', principles: ['solid', 'tdd'] },
      catalogue,
    );

    expect(brief.defaulted).not.toContain('migration');
    expect(brief.defaulted).not.toContain('principles');
  });

  it('RF-605 an explicit null context answer counts as unanswered', () => {
    const brief = buildBrief({ context: { deadline: null } }, catalogue);

    expect(brief.defaulted).toContain('context.deadline');
  });

  it('RF-605 the stack is kept in layer order and the principles sorted', () => {
    const brief = buildBrief(
      {
        principles: ['tdd', 'solid'],
        stack: [
          { layer: 'hosting', choice: 'Containers', custom: false },
          { layer: 'language-runtime', choice: 'Go', custom: true },
        ],
      },
      catalogue,
    );

    expect(brief.stack.map((entry) => entry.layer)).toEqual(['language-runtime', 'hosting']);
    expect(brief.principles).toEqual(['solid', 'tdd']);
  });
});

describe('briefProblems', () => {
  it('RF-605 answers that name known principles and distinct layers have no problem', () => {
    const answers = {
      principles: ['tdd'],
      stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
    } as const;

    expect(briefProblems(answers, catalogue)).toEqual([]);
  });

  it('RF-605 names a principle that is not in the catalogue', () => {
    expect(briefProblems({ principles: ['tdd', 'nonsense'] }, catalogue)).toEqual([
      { field: 'principles.1', reason: 'nonsense is not a principle.' },
    ]);
  });

  it('RF-605 an architecture style is not a principle', () => {
    expect(briefProblems({ principles: ['hexagonal'] }, catalogue)).toEqual([
      { field: 'principles.0', reason: 'hexagonal is not a principle.' },
    ]);
  });

  it('RF-605 names a principle listed twice', () => {
    expect(briefProblems({ principles: ['tdd', 'tdd'] }, catalogue)).toEqual([
      { field: 'principles', reason: 'A principle is listed twice.' },
    ]);
  });

  it('RF-605 names a stack layer listed twice', () => {
    const stack = [
      { layer: 'testing', choice: 'Vitest', custom: false },
      { layer: 'testing', choice: 'Jest', custom: false },
    ] as const;

    expect(briefProblems({ stack }, catalogue)).toEqual([
      { field: 'stack', reason: 'A layer is listed twice.' },
    ]);
  });
});

describe('sameBrief', () => {
  it('RF-605 two briefs with the same answers are the same whatever the save instant', () => {
    const left = { ...buildBrief({}, catalogue), savedAt: '2026-10-11T09:00:00.000Z' };
    const right = { ...buildBrief({}, catalogue), savedAt: '2026-10-12T09:00:00.000Z' };

    expect(sameBrief(left, right)).toBe(true);
  });

  it.each([
    ['principles', { principles: ['tdd'] }],
    ['migration', { migration: 'rewrite' }],
    ['architecture', { architecture: { style: 'clean' } }],
    ['stack', { stack: [{ layer: 'testing', choice: 'Vitest', custom: false }] }],
    ['context', { context: { teamSize: 2 } }],
    ['build method', { buildMethod: { aiAssisted: true } }],
  ] as const)('RF-605 a different %s makes a different brief', (_name, answers) => {
    expect(sameBrief(buildBrief({}, catalogue), buildBrief(answers, catalogue))).toBe(false);
  });

  it('RF-605 the same value answered instead of defaulted is a different brief', () => {
    const answered = buildBrief({ migration: 'strangler-fig' }, catalogue);

    expect(sameBrief(buildBrief({}, catalogue), answered)).toBe(false);
  });
});

describe('isBriefOutOfDate', () => {
  const savedAt = '2026-10-12T10:00:00.000Z';
  const savedMs = Date.parse(savedAt);
  const finishedPlan = (overrides: Partial<Run>): Run =>
    sampleRun({ stage: 'plan', queueState: 'Ended', endState: 'Completed', ...overrides });

  it('RF-605 a brief with no package is never out of date', () => {
    expect(isBriefOutOfDate(savedAt, [])).toBe(false);
    expect(isBriefOutOfDate(savedAt, [sampleRun({ stage: 'scan' })])).toBe(false);
  });

  it('RF-605 a brief saved after the package began is out of date', () => {
    const runs = [finishedPlan({ startedAt: savedMs - 1000 })];

    expect(isBriefOutOfDate(savedAt, runs)).toBe(true);
  });

  it('RF-605 a brief saved before the package began, or at the same instant, is up to date', () => {
    expect(isBriefOutOfDate(savedAt, [finishedPlan({ startedAt: savedMs + 1000 })])).toBe(false);
    expect(isBriefOutOfDate(savedAt, [finishedPlan({ startedAt: savedMs })])).toBe(false);
  });

  it('RF-605 only a completed plan run is a package', () => {
    const started = { startedAt: savedMs - 1000 };
    const other: Run[] = [
      sampleRun({ stage: 'understand', queueState: 'Ended', endState: 'Completed', ...started }),
      sampleRun({ stage: 'plan', queueState: 'Ended', endState: 'Failed', ...started }),
      sampleRun({ stage: 'plan', queueState: 'Ended', endState: 'CapReached', ...started }),
      sampleRun({ stage: 'plan', queueState: 'Running', ...started }),
    ];

    expect(isBriefOutOfDate(savedAt, other)).toBe(false);
  });

  it('RF-605 the newest package decides', () => {
    const runs = [
      finishedPlan({ startedAt: savedMs - 5000 }),
      finishedPlan({ startedAt: savedMs + 5000 }),
    ];

    expect(isBriefOutOfDate(savedAt, runs)).toBe(false);
  });

  it('RF-605 a package that never recorded a start counts from its queue time', () => {
    const runs = [finishedPlan({ startedAt: null, queuedAt: savedMs - 1000 })];

    expect(isBriefOutOfDate(savedAt, runs)).toBe(true);
  });
});
