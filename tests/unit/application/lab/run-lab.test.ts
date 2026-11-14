import { describe, expect, it } from 'vitest';
import type { PromptFile } from '../../../../src/application/agent/prompt-file.js';
import type { LabCallMeter } from '../../../../src/application/lab/lab-meter.js';
import { summariseLab, type LabResults } from '../../../../src/application/lab/lab-results.js';
import type { LabTarget } from '../../../../src/application/lab/lab-target.js';
import { RunLab } from '../../../../src/application/lab/run-lab.js';
import { ok } from '../../../../src/domain/errors/result.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-1402, RF-1403: a ledger that stopped the invocation ends the run Refused, whichever call it
// stopped on, the last one included.

const prompt: PromptFile = { name: 'x/y.v1.md', version: 'v1', sha256: '0'.repeat(64), text: 't' };
const MESSAGE = 'The ledger could not be written (disk full), so the invocation stops.';

const target: LabTarget = {
  id: 'x/y',
  role: 'verifier',
  parseInput: () => ok({ run: () => Promise.resolve({ usable: true, detail: 'Supported' }) }),
  readsAnswer: () => true,
};

/** A meter that saw one answered call and then a ledger that could not be written. */
const meter: LabCallMeter = {
  begin: () => undefined,
  end: () => ({
    calls: [...[{ text: 'ok', inputTokens: 1, outputTokens: 1, latencyMs: 1, costMicros: 1 }]].map(
      (call) => ({ ...call, modelVersion: 'm' }),
    ),
    failures: [],
    unansweredCostMicros: 0,
  }),
  stopped: () => MESSAGE,
};

describe('a run whose ledger stopped it on the last call', () => {
  it('RF-1402 ends Refused with the ledger message, not Completed', async () => {
    const written: LabResults[] = [];
    const lab = new RunLab({
      output: {
        write: (results) => {
          written.push(results);
          return Promise.resolve('folder');
        },
      },
      meter,
      role: {
        provider: { complete: () => Promise.reject(new Error('unused')) },
        model: 'm',
        maxOutputTokens: 10,
      },
      clock: new FixedClock('2026-11-13T09:00:00Z'),
      ids: new SequenceIdGenerator(),
      rosettaVersion: 'test',
    });

    const run = await lab.execute({
      ...{ target, prompt, model: { provider: 'fake', model: 'm' } },
      caseSet: {
        ...{ schemaVersion: 1, version: 's', prompt: 'x/y', description: '' },
        cases: [{ id: 'only', expected: undefined, split: 'tune', input: {} }],
      },
      setSha256: '1'.repeat(64),
      repetitions: 1,
    });

    expect(run.ok && run.value.results.endState).toBe('Refused');
    expect(written[0]?.refusal).toBe(MESSAGE);
    expect(written[0]?.cases).toHaveLength(1);
  });
});

describe('a run of a target with no first-try check', () => {
  it('RF-1403 writes the first-try validity of each case as not applicable (null), never as valid', async () => {
    const written: LabResults[] = [];
    const firstTurn: LabTarget = {
      ...target,
      parseInput: () => ok({ run: () => Promise.resolve({ usable: false, detail: 'Empty' }) }),
      readsAnswer: () => null,
    };
    const lab = new RunLab({
      output: {
        write: (results) => {
          written.push(results);
          return Promise.resolve('folder');
        },
      },
      meter: { ...meter, stopped: () => undefined },
      role: {
        provider: { complete: () => Promise.reject(new Error('unused')) },
        model: 'm',
        maxOutputTokens: 10,
      },
      clock: new FixedClock('2026-11-13T09:00:00Z'),
      ids: new SequenceIdGenerator(),
      rosettaVersion: 'test',
    });

    await lab.execute({
      ...{ target: firstTurn, prompt, model: { provider: 'fake', model: 'm' } },
      caseSet: {
        ...{ schemaVersion: 1, version: 's', prompt: 'x/y', description: '' },
        cases: [{ id: 'only', expected: undefined, split: 'tune', input: {} }],
      },
      setSha256: '1'.repeat(64),
      repetitions: 1,
    });

    expect(written[0]?.cases[0]).toMatchObject({ validFirstTry: null, repaired: false });
  });
});

/** A run whose judge counts the calls it gets; every one is unexpected here. */
function judgedLab(written: LabResults[], judged: { calls: number }): RunLab {
  return new RunLab({
    output: {
      write: (results) => {
        written.push(results);
        return Promise.resolve('folder');
      },
    },
    meter: { ...meter, stopped: () => undefined },
    role: {
      provider: { complete: () => Promise.reject(new Error('unused')) },
      model: 'm',
      maxOutputTokens: 10,
    },
    clock: new FixedClock('2026-11-13T09:00:00Z'),
    ids: new SequenceIdGenerator(),
    rosettaVersion: 'test',
    judge: {
      score: () => {
        judged.calls += 1;
        return Promise.resolve({
          ...{ state: 'unreadable' as const, criteria: [], overall: null, vetoed: false },
          ...{ rstCode: null, calls: 1, inputTokens: 1, outputTokens: 1, costMicros: 1 },
        });
      },
      stopped: () => undefined,
      infoFor: () => undefined,
    },
  });
}

describe('a judged run of a reader turn that calls tools', () => {
  it('RF-1410 records the turn and makes no judge call, as a run reads no answer from such a turn', async () => {
    const written: LabResults[] = [];
    const turn = {
      ...{ calls: 1, areaReads: 1, searches: 0, unlisted: 0, repeats: 0, relists: 0, stale: 0 },
      ...{ newLines: 2, generatedLines: 0, shareBefore: null, shareGain: 0.1, aimed: null },
    };
    const seen = ['read_file a.cs:1-2'];
    const toolTurn: LabTarget = {
      ...target,
      parseInput: () =>
        ok({
          run: () =>
            Promise.resolve({ usable: true, detail: 'ReadsFiles', turn: { ...turn, seen } }),
        }),
      readsAnswer: () => null,
    };
    const judged = { calls: 0 };

    await judgedLab(written, judged).execute({
      ...{ target: toolTurn, prompt, model: { provider: 'fake', model: 'm' } },
      caseSet: {
        ...{ schemaVersion: 1, version: 's', prompt: 'x/y', description: '' },
        cases: [{ id: 'only', expected: undefined, split: 'tune', input: {} }],
      },
      setSha256: '1'.repeat(64),
      repetitions: 1,
    });

    expect(judged.calls).toBe(0);
    expect(written[0]?.cases[0]?.judge).toBeUndefined();
    expect(written[0]?.cases[0]?.turn).toEqual({ ...turn, seen });
  });
});

describe('a label that is usable only where the case expects it', () => {
  it('RF-1410 makes NoCards usable only in a case labelled NoCards, and counts every label', async () => {
    const written: LabResults[] = [];
    const noCards: LabTarget = {
      ...target,
      parseInput: () =>
        ok({
          run: () =>
            Promise.resolve({ usable: false, detail: 'NoCards', usableWhenExpected: true }),
        }),
    };

    await judgedLab(written, { calls: 0 }).execute({
      ...{ target: noCards, prompt, model: { provider: 'fake', model: 'm' } },
      caseSet: {
        ...{ schemaVersion: 1, version: 's', prompt: 'x/y', description: '' },
        cases: [
          { id: 'empty-area', expected: 'NoCards', split: 'tune', input: {} },
          { id: 'code-area', expected: undefined, split: 'tune', input: {} },
        ],
      },
      setSha256: '1'.repeat(64),
      repetitions: 1,
    });

    const results = written[0];
    expect(results?.cases.map((each) => each.usable)).toEqual([true, false]);
    expect(results === undefined ? null : summariseLab(results).detailCounts).toEqual({
      NoCards: 2,
    });
  });
});

describe('a run of a target that records the counts of its check', () => {
  it('RF-1403 keeps the counts of each case in its result', async () => {
    const written: LabResults[] = [];
    const outcome = { usable: true, detail: 'Fixed', counts: { requirements: 3, tasks: 2 } };
    const counting: LabTarget = {
      ...target,
      parseInput: () => ok({ run: () => Promise.resolve(outcome) }),
    };

    await judgedLab(written, { calls: 0 }).execute({
      ...{ target: counting, prompt, model: { provider: 'fake', model: 'm' } },
      caseSet: {
        ...{ schemaVersion: 1, version: 's', prompt: 'x/y', description: '' },
        cases: [{ id: 'only', expected: undefined, split: 'tune', input: {} }],
      },
      ...{ setSha256: '1'.repeat(64), repetitions: 1 },
    });

    expect(written[0]?.cases[0]).toMatchObject({ counts: { requirements: 3, tasks: 2 } });
  });
});
