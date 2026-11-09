import { describe, expect, it, vi } from 'vitest';
import { OpenQuestionCounts } from '../../../../src/application/journey/open-question-counts.js';
import { RunEndFacts } from '../../../../src/application/journey/run-end-facts.js';
import type { RunCards } from '../../../../src/application/ports/run-cards.js';
import { DeleteRun } from '../../../../src/application/use-cases/delete-run.js';
import { RecordAnswers } from '../../../../src/application/use-cases/record-answers.js';
import { ReopenQuestion } from '../../../../src/application/use-cases/reopen-question.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { actor, setup } from '../../../support/journey-setup.js';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';
import { briefServices } from '../../../support/planning-brief-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { stockCards } from '../../../support/data-model-defect-cards.js';
import { RecordingFacts } from '../../../support/recording-journey-facts.js';

// P8-139, DEC-226, RF-615: each fact of the journey is stored by the code that knows it: the run's
// end (its code and Supported claims), every path that changes the open questions (the end of an
// understand run, an answer saved, a question reopened, a run deleted) and the brief save.

/** The cards of a run: five Supported claims in three cards. */
const cards: RunCards = { cardsOf: () => Promise.resolve(stockCards()) };
const loggerOf = () =>
  new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());

describe('the end of a run stores its journey facts', () => {
  it('DEC-226 RF-615 the lifecycle hands the end code of run.ended to the journey facts', async () => {
    const record = vi.fn(() => Promise.resolve());
    const h = createRunHarness({ endFacts: { record } });
    const run = await h.start(userAmy);

    h.executor.settle(run.id, { endState: 'Failed', errorCode: ERROR_CODES.planCoverageGap });
    await h.ended(run);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ id: run.id, endState: 'Failed' }),
      ERROR_CODES.planCoverageGap,
    );
  });

  it('DEC-226 an understand run stores its Supported claims and refreshes the questions of its project', async () => {
    const facts = new RecordingFacts();
    const refresh = vi.fn(() => Promise.resolve());
    const ends = new RunEndFacts({ cards, facts, counts: { refresh } });
    const run = sampleRun({ stage: 'understand', queueState: 'Ended', endState: 'Completed' });

    await ends.record(run, null);

    expect(facts.ends).toEqual([[run.id, { endCode: null, supportedClaims: 5 }]]);
    expect(refresh).toHaveBeenCalledWith({ userId: run.userId, projectId: run.projectId });
  });

  it('DEC-226 a plan run stores its end code and no claims, and leaves the questions alone', async () => {
    const facts = new RecordingFacts();
    const refresh = vi.fn(() => Promise.resolve());
    const ends = new RunEndFacts({ cards, facts, counts: { refresh } });
    const run = sampleRun({ stage: 'plan', queueState: 'Ended', endState: 'Failed' });

    await ends.record(run, ERROR_CODES.planCoverageGap);

    expect(facts.ends).toEqual([
      [run.id, { endCode: ERROR_CODES.planCoverageGap, supportedClaims: null }],
    ]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('the open questions are stored by every path that changes them', () => {
  it('DEC-226 RF-615 a refresh stores the open questions of the family on its runs', async () => {
    const world = await setup();
    const run = await world.seed({ brief: false });
    const facts = new RecordingFacts();
    const counts = new OpenQuestionCounts({ ...world.parts, ...world, facts, logger: loggerOf() });

    await counts.refresh({ userId: actor.userId, projectId: world.project.id });

    expect(facts.questions).toEqual([[actor.userId, [run?.id], 2]]);
  });

  it('DEC-226 RF-1007 saving an answer stores the new count', async () => {
    const world = await setup();
    const run = await world.seed({ brief: false });
    const facts = new RecordingFacts();
    const counts = new OpenQuestionCounts({ ...world.parts, ...world, facts, logger: loggerOf() });
    const deps = { runs: world.parts.runs, answers: world.answers, cards: world.priorCards };
    const save = new RecordAnswers({ ...deps, manifests: world.parts.manifests, counts });

    await save.execute({
      actor,
      runId: run?.id ?? '',
      answers: [{ cardId: 'OQ-001', answer: 'Yes' }],
    });

    expect(facts.questions.at(-1)).toEqual([actor.userId, [run?.id], 1]);
  });
});

describe('the open questions are stored by every path that changes them (reopen, delete)', () => {
  it('DEC-226 RF-241 reopening a question refreshes the count', async () => {
    const world = await setup();
    const run = await world.seed({ brief: false });
    const refresh = vi.fn(() => Promise.resolve());
    const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
    const reopen = new ReopenQuestion({
      ...{ runs: world.parts.runs, answers: world.answers, cards: world.priorCards },
      ...{ logger, manifests: world.parts.manifests, counts: { refresh } },
    });

    await reopen.execute({ actor, runId: run?.id ?? '', cardId: 'OQ-001' });

    expect(refresh).toHaveBeenCalledWith({ userId: actor.userId, projectId: world.project.id });
  });

  it('DEC-226 RF-1012 deleting a run refreshes the count of its project', async () => {
    const runs = new MemoryRunIndex();
    const clock = new FixedClock('2026-10-12T10:00:00.000Z');
    const logger = new MemoryLogger(clock, new SecretMasker());
    const run = sampleRun({
      ...{ userId: userAmy.userId, stage: 'understand' },
      ...{ queueState: 'Ended', endState: 'Completed' },
    });
    await runs.insert(run);
    const refresh = vi.fn(() => Promise.resolve());
    const folders = new MemoryWorkspaceFolders();
    const remove = new DeleteRun({ runs, folders, logger, counts: { refresh } });

    await remove.execute({ actor: userAmy, runId: run.id });

    expect(refresh).toHaveBeenCalledWith({ userId: run.userId, projectId: run.projectId });
  });
});

describe('the brief time is stored when the brief is saved', () => {
  it('DEC-226 RF-605 saving the brief stores when it was saved', async () => {
    const projects = new MemoryProjectRepository();
    const project = sampleProject({ userId: userAmy.userId });
    await projects.insertOrFind(project);
    const clock = new FixedClock('2026-10-12T10:00:00.000Z');
    const facts = new RecordingFacts();
    const { savePlanningBrief } = briefServices({
      ...{ projects, runs: new MemoryRunIndex(), briefs: new MemoryBriefStore(), clock },
      facts,
    });

    await savePlanningBrief.execute({ actor: userAmy, projectId: project.id, answers: {} });

    expect(facts.briefs).toEqual([
      [userAmy.userId, project.id, Date.parse('2026-10-12T10:00:00.000Z')],
    ]);
  });
});
