import { ALL_KEYS_SERVED } from './web-role-keys.js';
import { expect, vi } from 'vitest';
import type { Project } from '../../src/application/projects/project.js';
import type { RunQueue } from '../../src/application/runs/run-queue.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import { resumeProblemCheck } from '../../src/application/understand/resume-problem.js';
import { ResumeRun } from '../../src/application/use-cases/resume-run.js';
import { StartDeepen } from '../../src/application/use-cases/start-deepen.js';
import { StartRun } from '../../src/application/use-cases/start-run.js';
import { SubmitRun } from '../../src/application/use-cases/submit-run.js';
import type { Actor } from '../../src/domain/accounts/actor.js';
import type { Result } from '../../src/domain/errors/result.js';
import type { Run } from '../../src/domain/runs/run.js';
import { FileTaskResults } from '../../src/infrastructure/cards/file-task-results.js';
import { MemoryBriefStore } from './memory-brief-store.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { scanResultsOf, type Stores } from './understand-run-services.js';
import { UNDERSTAND_RUN_WAIT } from './understand-timeout.js';

// RF-200, RF-006, RF-209: the understand harness starts, resumes and deepens runs as the API does
// and waits for each to end.

/** What the harness's runs start with (the start request's options). */
export interface UnderstandStart {
  readonly areas?: readonly string[];
  readonly cloudConsent?: boolean;
  readonly withAnswers?: boolean;
  /** RF-208, Q-43: the run whose failed areas this run reads again (its id). */
  readonly retryOf?: string;
}

/** RF-209: what the owner confirms on the Deepen estimate; confirmed unless a test says not. */
export interface DeepenStart {
  readonly confirmed?: boolean;
  readonly maxRounds?: number;
  readonly coveragePass?: boolean;
  /** Another user's id, to deepen a run that is not theirs. */
  readonly actor?: Actor;
}

export function waitUntilEnded(s: Stores): (run: Run) => Promise<Run> {
  return async (run) => {
    let latest: Run | undefined;
    await vi.waitFor(
      async () => {
        latest = await s.runs.find(run.userId, run.id);
        if (latest?.queueState !== 'Ended') throw new Error('The run has not ended');
        const events = await s.log.read(scopeOf(latest), 0);
        if (events.at(-1)?.type !== 'run.ended') throw new Error('No run.ended yet');
      },
      { timeout: UNDERSTAND_RUN_WAIT, interval: 2 },
    );
    if (latest === undefined) throw new Error('The run vanished');
    return latest;
  };
}

export type Starter = (stage: 'scan' | 'understand', extra: UnderstandStart) => Promise<Run>;
export type Resumer = (run: Run) => Promise<Result<Run, string>>;
export type Deepener = (run: Run, request?: DeepenStart) => Promise<Result<Run, string>>;

/** The owner of a run or a project, as a signed-in user. */
const ownerOf = (userId: string): Actor => ({ userId, role: 'user' });

/** One Submit run for every start of the harness, so the run ids never repeat. */
export function submitOf(s: Stores, queue: RunQueue): SubmitRun {
  return new SubmitRun({
    ...{ runs: s.runs, manifests: s.manifests, queue, clock: s.clock },
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
  });
}

/** Resumes ended runs as the API does and waits for their end. */
export function resumerOf(s: Stores, queue: RunQueue): Resumer {
  const resumeRun = new ResumeRun({
    roleKeys: ALL_KEYS_SERVED,
    ...{ projects: s.projects, runs: s.runs, manifests: s.manifests, queue, clock: s.clock },
    problem: resumeProblemCheck({
      ...{ runs: s.runs, scans: scanResultsOf(s) },
      taskResults: new FileTaskResults({ writer: s.writer, masker: s.masker }),
    }),
  });
  const ended = waitUntilEnded(s);
  return async (run) => {
    const resumed = await resumeRun.execute({ actor: ownerOf(run.userId), runId: run.id });
    if (!resumed.ok) return resumed;
    return { ok: true, value: await ended(resumed.value.run) };
  };
}

/** RF-209: deepens completed runs as the confirmed Deepen does and waits for the new run's end. */
export function deepenerOf(s: Stores, submit: SubmitRun): Deepener {
  const startDeepen = new StartDeepen({
    roleKeys: ALL_KEYS_SERVED,
    ...{ projects: s.projects, runs: s.runs, manifests: s.manifests, submit },
  });
  const ended = waitUntilEnded(s);
  return async (run, request = {}) => {
    const { actor = ownerOf(run.userId), confirmed = true, ...rest } = request;
    const started = await startDeepen.execute({ actor, runId: run.id, confirmed, ...rest });
    if (!started.ok) return started;
    return { ok: true, value: await ended(started.value.run) };
  };
}

/** Starts runs of the project as the API does and waits for their end. */
export function starterOf(s: Stores, submit: SubmitRun, project: Project): Starter {
  const startRun = new StartRun({
    roleKeys: ALL_KEYS_SERVED,
    ...{ projects: s.projects, runs: s.runs, briefs: new MemoryBriefStore(), submit },
  });
  const ended = waitUntilEnded(s);
  return async (stage, extra) => {
    const started = await startRun.execute({
      actor: ownerOf(project.userId),
      projectId: project.id,
      stage,
      ...extra,
    });
    expect(started, `the ${stage} run is accepted`).toMatchObject({ ok: true });
    if (!started.ok) throw new Error(`The ${stage} run was refused: ${started.error}`);
    return ended(started.value.run);
  };
}
