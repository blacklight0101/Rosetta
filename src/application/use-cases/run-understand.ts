import { ERROR_CODES } from '../../domain/errors/codes.js';
import { ok } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  recordManifestCodeMap,
  recordPromptVersions,
  type PromptVersion,
} from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { promptVersionsOf, type ReaderPrompts } from '../agent/reader-prompts.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { CardOutputs } from '../ports/card-outputs.js';
import type { Clock } from '../ports/clock.js';
import type { CostLedger } from '../ports/cost-ledger.js';
import type { CostReportWriter } from '../ports/cost-report-writer.js';
import type { CostTotals } from '../ports/cost-totals.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { ProviderSetFactory, ProviderSinks } from '../ports/provider-set-factory.js';
import type { RunScope } from '../ports/run-events.js';
import type { RunExecution, RunExecutor, RunOutcome } from '../ports/run-executor.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { ScannedSource, ScanResults } from '../ports/scan-results.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { Project } from '../projects/project.js';
import type { RoleProvider } from '../providers/provider-set.js';
import { ManifestUpdates } from '../runs/manifest-updates.js';
import { writeCostReport } from '../runs/run-cost-report.js';
import { RunBudgetEvents } from '../runs/run-budget-events.js';
import { ownerLogger } from '../runs/owner-logger.js';
import { ManifestCostRecorder } from '../runs/run-cost-record.js';
import { scopeOf } from '../runs/run-scope.js';
import { callIds, traceIdOf } from '../runs/run-ids.js';
import { ManifestSecurityRecorder } from '../runs/run-security-record.js';
import { buildUnderstandRoles } from '../understand/build-understand-roles.js';
import { preflightOllama, type PreflightProblem } from '../understand/reader-preflight.js';
import { planReaderTasks, type ReaderTask } from '../understand/reader-tasks.js';
import {
  readUnderstandOptions,
  rolesUseTextToolProtocol,
} from '../understand/understand-options.js';
import { pinnedSourceOf } from '../understand/pinned-source.js';
import { UnderstandSession } from '../understand/understand-session.js';

// RF-200, RF-240, RF-300, RF-302, RF-426, RNF-002, ADR-005, ADR-006, ADR-007: the executor of the
// `understand` stage. It opens the code map and snapshot of the project's latest completed scan,
// plans one reader task per area (or per named area; an unknown name stops the run with RST-1307
// and the valid names in the log), builds the reader's guarded provider through the provider
// factory only, with the run's stop as the budget guard's stop, and runs the tasks with one abort
// signal. The cost report is written at every end, the stopped and capped ones included.

export interface RunUnderstandDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly users: UserRepository;
  readonly scans: ScanResults;
  readonly providers: ProviderSetFactory;
  /** The call log and the egress log of the run folder (RF-408, RF-142). */
  readonly runSinks: (scope: RunScope) => Pick<ProviderSinks, 'recorder' | 'egressLog'>;
  readonly manifests: RunManifestStore;
  readonly cards: CardOutputs;
  readonly answers: AnswersFile;
  readonly ledger: Pick<CostLedger, 'runEntries'>;
  /** RF-1010: the project totals the run's usage events start from. */
  readonly costTotals: Pick<CostTotals, 'projectGroups'>;
  readonly costReports: CostReportWriter;
  /** Reads the reader's prompt files with their versions and hashes (RNF-004). */
  readonly prompts: () => Promise<ReaderPrompts>;
  /** Reads the text tool protocol prompt, recorded when a role uses it (RF-205, RNF-004). */
  readonly textToolProtocol: () => Promise<PromptFile>;
  /** Reads the summariser's merge prompt, recorded when a merge call is made (RF-250, RNF-004). */
  readonly mergePrompt: () => Promise<PromptFile>;
  readonly clock: Clock;
  readonly logger: Logger;
  /** RF-145: the random tag of every data block the reader's tools write. */
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
}

/** What a run needs before its tasks can start. */
interface Prepared {
  readonly project: Project;
  readonly scanned: ScannedSource;
  readonly tasks: readonly ReaderTask[];
  readonly prompts: ReaderPrompts;
  readonly mergePrompt: PromptFile;
}

interface UnderstandRoles {
  readonly reader: RoleProvider;
  /** Absent when only the summariser cannot be served: the cards are then not merged. */
  readonly summariser: RoleProvider | undefined;
}

const failed = (code: RosettaError['code']): RunOutcome => ({
  endState: 'Failed',
  errorCode: code,
});

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
    const session = new UnderstandSession({
      ...prepared.value,
      ...{ execution, updates, role: roles.value.reader, summariser: roles.value.summariser },
      logger: ownerLogger(this.deps.logger, execution.run.userId),
      settings: prepared.value.project.settings,
      deps: this.deps,
      source: pinnedSourceOf(execution.manifest.source, prepared.value.scanned.source.commitSha),
      nextCallId,
      traceId: traceIdOf(execution.run),
      ids: this.deps.ids,
    });
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
    await execution.recordSource(scanned.source);
    await updates.update((stored) => recordManifestCodeMap(stored, scanned.codeMapHash));
    const options = readUnderstandOptions(manifest.options);
    const tasks = planReaderTasks(scanned.codeMap.areas, options.areas);
    if (!tasks.ok) {
      const message = 'An area named in the request is not in the code map.';
      const { unknown, valid } = tasks.error;
      const data = { unknown: [...unknown], valid: [...valid] };
      await this.log(run, ERROR_CODES.areaUnknown, message, data);
      return stop(failed(ERROR_CODES.areaUnknown));
    }
    const prompts = await this.deps.prompts();
    const versions = await this.promptVersions(project, prompts);
    await updates.update((stored) => ok(recordPromptVersions(stored, versions)));
    const mergePrompt = await this.deps.mergePrompt();
    return { ok: true, value: { project, scanned, tasks: tasks.value, prompts, mergePrompt } };
  }

  /** RNF-004: the reader's prompt files, and the text tool protocol when a role uses it. */
  private async promptVersions(
    project: Project,
    prompts: ReaderPrompts,
  ): Promise<Record<string, PromptVersion>> {
    const versions = promptVersionsOf(prompts);
    if (!rolesUseTextToolProtocol(project.settings)) return versions;
    const { name, version, sha256 } = await this.deps.textToolProtocol();
    return { ...versions, [name]: { version, sha256 } };
  }

  /** RF-200: the newest scan of the project that ended `Completed`. */
  private async latestScan(run: Run): Promise<Run | undefined> {
    const runs = await this.deps.runs.list(run.userId, run.projectId);
    return runs.find((each) => each.stage === 'scan' && each.endState === 'Completed');
  }

  /**
   * ADR-003, RF-405, RF-427, RF-143: the guarded providers of the reader and the summariser (RF-250),
   * from the provider factory only.
   * A role that cannot be served (no key, unpriced model, no consent) stops the run before a call.
   */
  private async rolesOf(
    execution: RunExecution,
    project: Project,
    updates: ManifestUpdates,
    nextCallId: () => string,
  ): Promise<Step<UnderstandRoles>> {
    const { run, manifest } = execution;
    const account = await this.deps.users.findById(run.userId);
    if (account === undefined) return stop(failed(ERROR_CODES.notFound));
    const built = await buildUnderstandRoles(this.deps.providers, {
      account,
      run: { id: run.id, userId: run.userId, projectId: run.projectId, stage: 'understand' },
      settings: project.settings,
      cloudConsent: readUnderstandOptions(manifest.options).cloudConsent,
      sinks: await this.sinksOf(execution, updates),
    });
    if (!built.ok) {
      for (const problem of built.error) {
        const message = `The ${problem.role} role cannot use provider "${problem.provider}".`;
        await this.log(run, problem.code, message, {
          role: problem.role,
          provider: problem.provider,
        });
      }
      return stop(failed(built.error[0]?.code ?? ERROR_CODES.providerUnavailable));
    }
    const reader = built.value.get('reader');
    const summariser = built.value.get('summariser');
    if (reader === undefined) return stop(failed(ERROR_CODES.providerUnavailable));
    // Only the reader is checked: a summariser that is not ready fails its own call, which is skipped.
    const ready = await preflightOllama(new Map([['reader', reader]]), {
      runId: run.runKey,
      traceId: traceIdOf(run),
      nextCallId,
      signal: execution.signal,
    });
    if (!ready.ok) return stop(await this.notReady(execution, ready.error));
    return { ok: true, value: { reader, summariser } };
  }

  /** The run's sinks for its guards: call log, egress log, manifest records, stop and events. */
  private async sinksOf(execution: RunExecution, updates: ManifestUpdates): Promise<ProviderSinks> {
    const { run, events } = execution;
    const scope = scopeOf(run);
    const { manifests, runs, ledger, costTotals } = this.deps;
    const logger = ownerLogger(this.deps.logger, run.userId);
    return {
      ...this.deps.runSinks(scope),
      security: new ManifestSecurityRecorder({ manifests, scope, queue: updates.queue }),
      costs: new ManifestCostRecorder({ manifests, runs, scope, queue: updates.queue }),
      stopRun: (reason) => {
        execution.stop(reason);
      },
      // RF-1003, RF-1010: usage and budget events start from what the run and project spent.
      budgetEvents: await RunBudgetEvents.open({ events, run, ledger, costTotals, logger }),
    };
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

type Step<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly outcome: RunOutcome };

function stop(outcome: RunOutcome): { readonly ok: false; readonly outcome: RunOutcome } {
  return { ok: false, outcome };
}
