import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { recordManifestCodeMap } from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { CardOutputs } from '../ports/card-outputs.js';
import type { Clock } from '../ports/clock.js';
import type { CostLedger } from '../ports/cost-ledger.js';
import type { CostReportWriter } from '../ports/cost-report-writer.js';
import type { CostTotals } from '../ports/cost-totals.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Logger } from '../ports/logger.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { ProviderSetFactory, ProviderSinks } from '../ports/provider-set-factory.js';
import type { RunScope } from '../ports/run-events.js';
import type { TaskResults } from '../ports/task-results.js';
import type { RunExecution, RunExecutor, RunOutcome } from '../ports/run-executor.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { Project } from '../projects/project.js';
import { ManifestUpdates } from '../runs/manifest-updates.js';
import { writeCostReport } from '../runs/run-cost-report.js';
import { ownerLogger } from '../runs/owner-logger.js';
import { scopeOf } from '../runs/run-scope.js';
import { callIds, traceIdOf } from '../runs/run-ids.js';
import { preflightOllama, type PreflightProblem } from '../understand/reader-preflight.js';
import type { UnknownAreas } from '../understand/reader-tasks.js';
import { logSkippedQuestions, publishSkippedQuestions } from '../understand/skipped-questions.js';
import { plannedAreas } from '../understand/planned-areas.js';
import { planTasks } from '../understand/task-plan.js';
import { readUnderstandOptions, UNDERSTAND_ROLES } from '../understand/understand-options.js';
import { pinnedSourceOf } from '../understand/pinned-source.js';
import { resumeSourceProblem } from '../understand/resume-state.js';
import { announceRetry, scheduleTasks } from '../understand/retry-plan.js';
import { recordRunTexts, type RunTextSources } from '../understand/run-texts.js';
import type { Prepared, RolesWithBudget } from '../understand/run-understand-types.js';
import { UnderstandSession } from '../understand/understand-session.js';
import { runProviderSinks } from '../understand/run-sinks.js';
import { withRoom } from '../understand/reader-room.js';
import type { SecretLines } from '../ports/secret-lines.js';
import { sameFamilyWarning } from '../verifier/family-warning.js';
import { runDeepen } from '../deepen/deepen-session.js';
import {
  failed,
  optionalPartsOf,
  stop,
  understandRolesOf,
  type Step,
} from '../understand/run-understand-steps.js';

// RF-200, RF-240, RF-300, RF-302, RF-426, RNF-002, ADR-005, ADR-006, ADR-007: the executor of the
// `understand` stage. It opens the code map and snapshot of the latest completed scan, plans one
// reader task per area (or per named area; an unknown name stops the run with RST-1307), builds
// the guarded providers through the provider factory only, with the run's stop as the budget
// guard's stop, and runs the tasks with one abort signal. The cost report is written at every end.

/** The prompt files are those of `RunTextSources`: each is read with its version and hash (RNF-004). */
export interface RunUnderstandDependencies extends RunTextSources {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly users: UserRepository;
  readonly scans: ScanResults;
  readonly providers: ProviderSetFactory;
  /** The call log and the egress log of the run folder (RF-408, RF-142). */
  readonly runSinks: (scope: RunScope) => Pick<ProviderSinks, 'recorder' | 'egressLog'>;
  readonly manifests: RunManifestStore;
  readonly cards: CardOutputs;
  readonly taskResults: TaskResults;
  readonly answers: AnswersFile;
  readonly ledger: Pick<CostLedger, 'runEntries'>;
  /** RF-1010: the project totals the run's usage events start from. */
  readonly costTotals: Pick<CostTotals, 'projectGroups'>;
  readonly costReports: CostReportWriter;
  /** P5-34: which cited lines hold a value Rosetta masks (a claim that it is masked is rejected). */
  readonly secretLines: SecretLines;
  /** RF-241: the cards of earlier runs, read for a re-run and marked `Answered` by it. */
  readonly priorCards: PriorCards;
  readonly clock: Clock;
  readonly logger: Logger;
  /** RF-145: the random tag of every data block the reader's tools write. */
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
}

export class RunUnderstand implements RunExecutor {
  private readonly deps: RunUnderstandDependencies;

  constructor(deps: RunUnderstandDependencies) {
    this.deps = deps;
  }

  // RF-200, RF-426, RF-1108
  async execute(execution: RunExecution): Promise<RunOutcome> {
    try {
      return await this.understand(execution);
    } catch (error) {
      if (execution.signal.aborted) return { endState: 'Interrupted' };
      if (error instanceof RosettaError) return failed(error.code);
      throw error;
    } finally {
      await writeCostReport(this.deps, execution.run);
    }
  }

  private async understand(execution: RunExecution): Promise<RunOutcome> {
    const updates = new ManifestUpdates(this.deps.manifests, scopeOf(execution.run));
    const prepared = await this.prepare(execution, updates);
    if (!prepared.ok) return prepared.outcome;
    const nextCallId = callIds(execution.run);
    const roles = await this.rolesOf(execution, prepared.value.project, updates, nextCallId);
    if (!roles.ok) return roles.outcome;
    if (execution.signal.aborted) return { endState: 'Interrupted' };
    const parts = {
      ...prepared.value,
      tasks: prepared.value.plan.tasks,
      kept: prepared.value.plan.kept,
      ...{ execution, updates, role: roles.value.reader, summariser: roles.value.summariser },
      verifier: {
        role: roles.value.verifier,
        prompts: prepared.value.verifierPrompts,
        secretLines: this.deps.secretLines,
      },
      logger: ownerLogger(this.deps.logger, execution.run.userId),
      settings: prepared.value.project.settings,
      deps: this.deps,
      source: pinnedSourceOf(execution.manifest.source, prepared.value.scanned.source.commitSha),
      nextCallId,
      traceId: traceIdOf(execution.run),
      ids: this.deps.ids,
    };
    const { deepen } = readUnderstandOptions(execution.manifest.options); // RF-209, RF-429
    const withTheRoom = withRoom(execution, parts, roles.value.budget);
    if (deepen !== undefined) return runDeepen({ ...withTheRoom, request: deepen });
    if (prepared.value.retry !== undefined) await announceRetry(execution, prepared.value.retry);
    const session = new UnderstandSession(withTheRoom);
    await session.plan();
    await session.run();
    await session.finish();
    return session.outcome();
  }

  /** The project, the scanned source, the tasks and the prompts, each recorded (RF-126, RNF-004). */
  private async prepare(
    execution: RunExecution,
    updates: ManifestUpdates,
  ): Promise<Step<Prepared>> {
    const { run, manifest } = execution;
    const project = await this.deps.projects.find(run.userId, run.projectId);
    if (project === undefined) return stop(failed(ERROR_CODES.notFound));
    const scan = await this.latestScan(run);
    if (scan === undefined) return stop(failed(ERROR_CODES.codeMapMissing));
    const scanned = await this.deps.scans.open(scan);
    const changed = resumeSourceProblem(manifest, scanned);
    if (changed !== undefined) {
      return this.refuse(
        run,
        changed,
        'The code map of the latest scan is not the one this run read.',
      );
    }
    await execution.recordSource(scanned.source);
    await updates.update((stored) => recordManifestCodeMap(stored, scanned.codeMapHash));
    const options = readUnderstandOptions(manifest.options);
    const deps = { answers: this.deps.answers, cards: this.deps.priorCards };
    const ref = { userId: run.userId, projectId: run.projectId };
    const areas = plannedAreas(scanned);
    const planned = await planTasks({ areas, options, project: ref, rerun: deps, scanned });
    if (!planned.ok) return this.unknownAreas(run, planned.error);
    const { tasks, rerun } = planned.value;
    const scheduled = await scheduleTasks(this.deps, execution, { tasks, scanned, options });
    if (!scheduled.ok) {
      return this.refuse(
        run,
        scheduled.error,
        'The run to retry cannot be read as this retry needs it.',
      );
    }
    const { plan, allTasks, link } = scheduled.value;
    const skipped = rerun?.plan.skipped ?? [];
    await logSkippedQuestions(this.deps.logger, run, skipped);
    await publishSkippedQuestions(execution.events, skipped);
    const texts = await recordRunTexts(this.deps, updates, {
      ...{ project, scanned, tasks, options, rerun },
    });
    const base = { project, scanned, plan, allTasks, ...texts };
    return { ok: true, value: { ...base, ...optionalPartsOf(rerun, link) } };
  }

  /** The run cannot start for this reason: it is logged and the run ends `Failed` with the code. */
  private async refuse(run: Run, code: ErrorCode, message: string): Promise<Step<never>> {
    await this.log(run, code, message, {});
    return stop(failed(code));
  }

  /** RF-200: an area named in the request is not in the code map; the valid names are logged. */
  private async unknownAreas(run: Run, problem: UnknownAreas): Promise<Step<never>> {
    const message = 'An area named in the request is not in the code map.';
    const data = { unknown: [...problem.unknown], valid: [...problem.valid] };
    await this.log(run, ERROR_CODES.areaUnknown, message, data);
    return stop(failed(ERROR_CODES.areaUnknown));
  }

  /** RF-200: the newest scan of the project that ended `Completed`. */
  private async latestScan(run: Run): Promise<Run | undefined> {
    const runs = await this.deps.runs.list(run.userId, run.projectId);
    return runs.find((each) => each.stage === 'scan' && each.endState === 'Completed');
  }

  /**
   * ADR-003, RF-405, RF-427, RF-143, RF-301: the guarded providers of the reader, the verifier and
   * the summariser (RF-250), from the provider factory only. A role that cannot be served (no key,
   * unpriced model, no consent) stops the run before a call; a verifier of the reader's model family
   * is a warning.
   */
  private async rolesOf(
    execution: RunExecution,
    project: Project,
    updates: ManifestUpdates,
    nextCallId: () => string,
  ): Promise<Step<RolesWithBudget>> {
    const { run, manifest } = execution;
    const account = await this.deps.users.findById(run.userId);
    if (account === undefined) return stop(failed(ERROR_CODES.notFound));
    const sinks = await runProviderSinks(this.deps, execution, updates);
    const options = readUnderstandOptions(manifest.options);
    const built = await this.deps.providers.build({
      account,
      run: { id: run.id, userId: run.userId, projectId: run.projectId, stage: 'understand' },
      settings: project.settings,
      roles: UNDERSTAND_ROLES,
      cloudConsent: options.cloudConsent,
      // RF-432: the run pauses near the amount its owner approved.
      approvedAmount: options.approvedAmount,
      sinks,
    });
    if (!built.ok) {
      for (const problem of built.error) {
        const message =
          problem.message ?? `The ${problem.role} role cannot use provider "${problem.provider}".`;
        await this.log(run, problem.code, message, {
          role: problem.role,
          provider: problem.provider,
        });
      }
      return stop(failed(built.error[0]?.code ?? ERROR_CODES.providerUnavailable));
    }
    const roles = understandRolesOf(built.value);
    if (roles === undefined) return stop(failed(ERROR_CODES.providerUnavailable));
    const warning = sameFamilyWarning(roles.reader.model, roles.verifier.model);
    if (warning !== undefined)
      await this.deps.logger.log({ ...warning, runId: run.runKey, userId: run.userId });
    const ready = await preflightOllama(built.value, {
      runId: run.runKey,
      traceId: traceIdOf(run),
      nextCallId,
      signal: execution.signal,
    });
    if (!ready.ok) return stop(await this.notReady(execution, ready.error));
    return { ok: true, value: { ...roles, budget: sinks.budgetEvents } };
  }

  /** RF-401: an Ollama that cannot answer ends the run before its first task (a stop interrupts). */
  private async notReady(execution: RunExecution, problem: PreflightProblem): Promise<RunOutcome> {
    if (execution.signal.aborted) return { endState: 'Interrupted' };
    await this.log(
      execution.run,
      problem.code,
      'An Ollama provider of the run is not ready; no agent task was started.',
      {
        role: problem.role,
        provider: problem.provider,
        model: problem.model,
        nextStep: problem.nextStep,
      },
    );
    return failed(problem.code);
  }

  private log(
    run: Run,
    code: RosettaError['code'],
    message: string,
    data: Readonly<Record<string, string | string[]>>,
  ): Promise<void> {
    return this.deps.logger.log({
      ...{ level: 'error', logger: 'understand', message, code },
      ...{ runId: run.runKey, userId: run.userId, data },
    });
  }
}
