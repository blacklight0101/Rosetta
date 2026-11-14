import { describe, expect, it } from 'vitest';
import type { PromptFile } from '../../../../src/application/agent/prompt-file.js';
import type { LabCallMeter } from '../../../../src/application/lab/lab-meter.js';
import type { LabResults } from '../../../../src/application/lab/lab-results.js';
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

describe('a run of a target that records the counts of its check', () => {
  it('RF-1403 keeps the counts of each case in its result', async () => {
    const written: LabResults[] = [];
    const outcome = { usable: true, detail: 'Fixed', counts: { requirements: 3, tasks: 2 } };
    const counting: LabTarget = {
      ...target,
      parseInput: () => ok({ run: () => Promise.resolve(outcome) }),
    };
    const lab = new RunLab({
      output: { write: (results) => Promise.resolve(written.push(results) > 0 ? 'folder' : '') },
      meter: { ...meter, stopped: () => undefined },
      role: {
        provider: { complete: () => Promise.reject(new Error('unused')) },
        ...{ model: 'm', maxOutputTokens: 10 },
      },
      ...{ clock: new FixedClock('2026-11-13T09:00:00Z'), ids: new SequenceIdGenerator() },
      rosettaVersion: 'test',
    });

    await lab.execute({
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
