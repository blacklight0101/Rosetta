import { describe, expect, it } from 'vitest';
import type { AgentTaskResult } from '../../../../src/application/agent/agent-task-result.js';
import { areaFailureOf } from '../../../../src/application/understand/area-failure.js';
import {
  combineResults,
  halvesOf,
  needsRetry,
  retryAttempts,
} from '../../../../src/application/understand/task-retry.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { draftOf } from '../../../support/card-fixtures.js';

// RF-208, DEC-138: which task ends earn a fresh start, how an area is split for it, how the runs of
// one task become one result, and which ends make an area "failed".

function resultOf(overrides: Partial<AgentTaskResult> = {}): AgentTaskResult {
  return {
    state: 'InvalidOutput',
    reason: 'invalid-output',
    code: ERROR_CODES.cardOutputInvalid,
    drafts: [],
    rawOutputs: ['raw'],
    problems: [],
    turns: 3,
    toolErrors: 1,
    usage: { inputTokens: 100, outputTokens: 10, cachedInputTokens: 5 },
    modelVersion: 'model-1',
    messages: [],
    ...overrides,
  };
}

describe('needsRetry', () => {
  it.each([
    'invalid-output',
    'repeated-calls',
    'unknown-tools',
    'context-limit',
    'max-turns',
  ] as const)('RF-208 a task that ended %s with no card is retried', (reason) => {
    expect(needsRetry(resultOf({ reason }))).toBe(true);
  });

  it.each(['final-answer', 'aborted', 'cap-reached', 'provider-failed'] as const)(
    'RF-208 a task that ended %s is not retried',
    (reason) => {
      expect(needsRetry(resultOf({ reason }))).toBe(false);
    },
  );

  it('RF-208 a task that gave a card is not retried, whatever else went wrong', () => {
    expect(needsRetry(resultOf({ drafts: [draftOf()] }))).toBe(false);
  });
});

describe('halvesOf', () => {
  const area = {
    name: 'Models',
    files: ['a.cs', 'b.cs', 'c.cs', 'd.cs'],
    estimatedTokens: 400,
    mapLevel: 'coarse',
    origin: 'folder',
  } as const;
  const tokens = (path: string): number => (path === 'a.cs' ? 250 : 50);

  it('RF-208 splits the files of an area in two runs of about the same tokens, keeping the name', () => {
    const halves = halvesOf(area, tokens);

    expect(halves?.map((half) => half.files)).toEqual([['a.cs'], ['b.cs', 'c.cs', 'd.cs']]);
    expect(halves?.map((half) => half.estimatedTokens)).toEqual([250, 150]);
    expect(halves?.every((half) => half.name === 'Models')).toBe(true);
  });

  it('RF-208 every half holds at least one file', () => {
    const halves = halvesOf({ ...area, files: ['a.cs', 'b.cs'] }, () => 0);

    expect(halves?.map((half) => half.files.length)).toEqual([1, 1]);
  });

  it('RF-208 an area of one file cannot be split', () => {
    expect(halvesOf({ ...area, files: ['a.cs'] }, tokens)).toBeUndefined();
  });
});

describe('combineResults', () => {
  it('RF-208 adds up the work of every run and keeps all raw outputs', () => {
    const first = resultOf({ rawOutputs: ['one', 'two'] });
    const retry = resultOf({ rawOutputs: ['three'], modelVersion: null, turns: 2 });

    const combined = combineResults([first, retry]);

    expect(combined.turns).toBe(5);
    expect(combined.toolErrors).toBe(2);
    expect(combined.usage).toEqual({ inputTokens: 200, outputTokens: 20, cachedInputTokens: 10 });
    expect(combined.rawOutputs).toEqual(['one', 'two', 'three']);
    expect(combined.modelVersion).toBe('model-1');
  });

  it('RF-208 a retry that gave cards makes the task Done', () => {
    const done = resultOf({
      state: 'Done',
      reason: 'final-answer',
      drafts: [draftOf()],
      rawOutputs: [],
    });

    const combined = combineResults([resultOf(), done]);

    expect(combined.state).toBe('Done');
    expect(combined.drafts).toHaveLength(1);
    expect(combined.reason).toBe('final-answer');
  });

  it('RF-208 the cards of both halves of a split are kept, a card seen twice once', () => {
    const half = (title: string) =>
      resultOf({ state: 'Done', reason: 'final-answer', drafts: [draftOf({ title })] });

    const combined = combineResults([
      resultOf({ reason: 'context-limit' }),
      half('A'),
      half('B'),
      half('A'),
    ]);

    expect(combined.drafts.map((draft) => draft.title)).toEqual(['A', 'B']);
    expect(combined.state).toBe('Done');
  });

  it('RF-208 when nothing gave a card the end of the last run decides', () => {
    const last = resultOf({ reason: 'max-turns', state: 'TurnLimitReached' });

    expect(combineResults([resultOf(), last]).state).toBe('TurnLimitReached');
  });
});

describe('areaFailureOf', () => {
  it('RF-208 an area that gave a card did not fail, whatever its state', () => {
    expect(areaFailureOf({ state: 'TurnLimitReached', drafts: [draftOf()] })).toBeUndefined();
  });

  it('RF-208 an area that finished with no card to report did not fail', () => {
    expect(areaFailureOf({ state: 'Done', drafts: [] })).toBeUndefined();
  });

  it.each([
    ['InvalidOutput', 'invalid output (RST-1300)'],
    ['Failed', 'failed (RST-1300)'],
    ['TurnLimitReached', 'turn limit reached without a card (RST-1300)'],
    ['StoppedByCap', 'stopped by a cap without a card (RST-1300)'],
  ] as const)('RF-208 an area whose task ended %s without a card failed: %s', (state, text) => {
    expect(areaFailureOf({ state, code: ERROR_CODES.cardOutputInvalid, drafts: [] })).toBe(text);
  });

  it('RF-208 a failure without a code says only why', () => {
    expect(areaFailureOf({ state: 'InvalidOutput', drafts: [] })).toBe('invalid output');
  });
});

describe('retryAttempts', () => {
  const area = {
    name: 'Models',
    files: ['a.cs', 'b.cs'],
    estimatedTokens: 100,
    mapLevel: 'coarse',
    origin: 'folder',
  } as const;
  const task = { agentTaskId: 'reader-004', area };
  const plan = { task, tokensOf: () => 50, turns: 12 } as const;

  it.each(['invalid-output', 'repeated-calls', 'unknown-tools', 'max-turns'] as const)(
    'RF-208 a task that ended %s is run again once, whole, under its own transcript id',
    (reason) => {
      const attempts = retryAttempts({ ...plan, reason });

      expect(attempts).toEqual([{ callTaskId: 'reader-004-retry', area }]);
    },
  );

  it('RF-208 an area that met its context limit is read in two halves of half the turn limit each', () => {
    const attempts = retryAttempts({ ...plan, reason: 'context-limit' });

    expect(attempts.map((attempt) => attempt.callTaskId)).toEqual([
      'reader-004-retry-1',
      'reader-004-retry-2',
    ]);
    expect(attempts.map((attempt) => attempt.area.files)).toEqual([['a.cs'], ['b.cs']]);
    expect(attempts.map((attempt) => attempt.maxTurns)).toEqual([6, 6]);
  });

  it('RF-208 an odd turn limit never gives the halves more turns than the limit', () => {
    const attempts = retryAttempts({ ...plan, reason: 'context-limit', turns: 5 });

    expect(attempts.map((attempt) => attempt.maxTurns)).toEqual([2, 2]);
  });

  it('RF-208 a one-file area that met its context limit is not retried: it would meet it again', () => {
    const one = { ...task, area: { ...area, files: ['a.cs'] } };

    expect(retryAttempts({ ...plan, task: one, reason: 'context-limit' })).toEqual([]);
  });

  it('RF-208 with a limit of one turn there is nothing to share, so the area is read whole', () => {
    const attempts = retryAttempts({ ...plan, reason: 'context-limit', turns: 1 });

    expect(attempts).toEqual([{ callTaskId: 'reader-004-retry', area }]);
  });
});
