import { describe, expect, it, vi } from 'vitest';
import { OpenQuestionCounts } from '../../../../src/application/journey/open-question-counts.js';
import { DeleteRun } from '../../../../src/application/use-cases/delete-run.js';
import { RecordAnswers } from '../../../../src/application/use-cases/record-answers.js';
import { err } from '../../../../src/domain/errors/result.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { actor, olderKey, setup } from '../../../support/journey-setup.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';
import { noJourneyFacts, RecordingFacts } from '../../../support/recording-journey-facts.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// P8-139, DEC-226, RF-615: the stored open questions are refreshed after every change, also when the
// change stopped part way; a refresh the database refuses is logged and never fails the change it
// follows; two refreshes of one project store their counts in the order they were asked.

const loggerOf = () =>
  new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());

async function world() {
  const w = await setup();
  const run = await w.seed({ brief: false });
  if (run === undefined) throw new Error('No source run');
  const logger = loggerOf();
  const files = { ...w.parts, ...w, logger };
  return { ...w, run, logger, files };
}

describe('the open questions are refreshed after a change that stopped part way', () => {
  it('DEC-226 RF-1007 an answer save refused part way still refreshes the count', async () => {
    const w = await world();
    const refresh = vi.fn(() => Promise.resolve());
    vi.spyOn(w.answers, 'recordAnswers').mockResolvedValue(err('invalid-choice'));
    const save = new RecordAnswers({
      ...{ runs: w.parts.runs, answers: w.answers, cards: w.priorCards },
      ...{ manifests: w.parts.manifests, counts: { refresh } },
    });

    const saved = await save.execute({
      actor,
      runId: w.run.id,
      answers: [{ cardId: 'OQ-001', answer: 'Yes' }],
    });

    expect(saved).toEqual(err('invalid-choice'));
    expect(refresh).toHaveBeenCalledWith({ userId: actor.userId, projectId: w.project.id });
  });
});

describe('a refresh the database refuses', () => {
  it('DEC-226 RF-615 is logged and the refresh does not fail', async () => {
    const w = await world();
    const facts = {
      ...noJourneyFacts,
      recordOpenQuestions: () => Promise.reject(new Error('The database is down.')),
    };
    const counts = new OpenQuestionCounts({ ...w.files, facts });

    await counts.refresh({ userId: actor.userId, projectId: w.project.id });

    const warnings = w.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warnings.map((entry) => [entry.logger, entry.data?.['projectId']])).toEqual([
      ['journey', w.project.id],
    ]);
  });

  it('DEC-226 RF-1012 a deleted run stays deleted and logged when the refresh is refused', async () => {
    const w = await world();
    const facts = {
      ...noJourneyFacts,
      recordOpenQuestions: () => Promise.reject(new Error('The database is down.')),
    };
    const counts = new OpenQuestionCounts({ ...w.files, facts });
    const older = sampleRun({
      ...{ userId: actor.userId, projectId: w.project.id, stage: 'understand', runKey: olderKey },
      ...{ queueState: 'Ended', endState: 'Completed' },
    });
    await w.parts.runs.insert(older);
    const remove = new DeleteRun({
      ...{ runs: w.parts.runs, folders: new MemoryWorkspaceFolders(), logger: w.logger, counts },
    });

    const deleted = await remove.execute({ actor, runId: older.id });

    expect(deleted.ok).toBe(true);
    const messages = w.logger.entries.map((entry) => entry.message);
    expect(messages).toContain(`Run ${olderKey} deleted, freeing 0 bytes.`);
    expect(w.logger.entries.filter((entry) => entry.level === 'warn')).toHaveLength(1);
  });
});

describe('two refreshes of one project', () => {
  it('DEC-226 RF-646 store their counts in the order they were asked', async () => {
    const w = await world();
    const facts = new RecordingFacts();
    const reached = deferred();
    const held = deferred();
    let calls = 0;
    const holding = {
      recordOpenQuestions: async (userId: string, runIds: readonly string[], count: number) => {
        calls += 1;
        if (calls === 1) {
          reached.resolve();
          await held.promise;
        }
        await facts.recordOpenQuestions(userId, runIds, count);
      },
    };
    const counts = new OpenQuestionCounts({ ...w.files, facts: holding });
    const project = { userId: actor.userId, projectId: w.project.id };

    // The first refresh counted 2 and is about to store it when an answer lowers the count to 1.
    const first = counts.refresh(project);
    await reached.promise;
    await w.answers.recordAnswers(project, w.run.runKey, [{ cardId: 'OQ-001', answer: 'Yes' }]);
    const second = counts.refresh(project);
    // Every step of the memory files is a promise: one timer lets the second refresh run as far as it can.
    await new Promise((resolve) => setTimeout(resolve, 20));
    held.resolve();
    await Promise.all([first, second]);

    expect(facts.questions.map(([, , count]) => count)).toEqual([2, 1]);
  });
});

function deferred(): { readonly promise: Promise<void>; resolve(): void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
