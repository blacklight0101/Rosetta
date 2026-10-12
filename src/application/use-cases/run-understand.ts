import { ERROR_CODES } from '../../domain/errors/codes.js';
import { ok } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  recordManifestCodeMap,
  recordManifestPriceTable,
  recordPromptVersions,
} from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import { parseCommitSha } from '../../domain/sources/commit-sha.js';
import { promptVersionsOf, type ReaderPrompts } from '../agent/reader-prompts.js';
import { buildCostReport } from '../budget/cost-report.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { CardOutputs, CardSource } from '../ports/card-outputs.js';
import type { Clock } from '../ports/clock.js';
import type { CostLedger } from '../ports/cost-ledger.js';
import type { CostReportWriter } from '../ports/cost-report-writer.js';
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
import { ManifestCostRecorder } from '../runs/run-cost-record.js';
import { scopeOf } from '../runs/run-scope.js';
import { ManifestSecurityRecorder } from '../runs/run-security-record.js';
import { planReaderTasks, type ReaderTask } from '../understand/reader-tasks.js';
import { readUnderstandOptions, UNDERSTAND_ROLES } from '../understand/understand-options.js';
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
  readonly costReports: CostReportWriter;
  /** Reads the reader's prompt files with their versions and hashes (RNF-004). */
  readonly prompts: () => Promise<ReaderPrompts>;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** What a run needs before its tasks can start. */
interface Prepared {
  readonly project: Project;
  readonly scanned: ScannedSource;
  readonly tasks: readonly ReaderTask[];
  readonly prompts: ReaderPrompts;
}

const failed = (code: RosettaError['code']): RunOutcome => ({
  endState: 'Failed',
  errorCode: code,
});

/** One trace per run (32 hexadecimal characters): the run's UUID without its dashes. */
function traceIdOf(run: Run): string {
  const hex = run.id.replace(/-/gu, '').toLowerCase();
  return /^[0-9a-f]{32}$/u.test(hex)
    ? hex
    : hex
        .replace(/[^0-9a-f]/gu, '0')
        .padEnd(32, '0')
        .slice(0, 32);
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
      await this.writeCostReport(execution.run);
    }
  }

  private async understand(execution: RunExecution): Promise<RunOutcome> {
    const updates = new ManifestUpdates(this.deps.manifests, scopeOf(execution.run));
    const prepared = await this.prepare(execution, updates);
    if (!prepared.ok) return prepared.outcome;
    const role = await this.readerOf(execution, prepared.value.project, updates);
    if (!role.ok) return role.outcome;
    if (execution.signal.aborted) return { endState: 'Interrupted' };
    const session = new UnderstandSession({
      ...prepared.value,
      ...{ execution, updates, role: role.value, logger: this.deps.logger },
      settings: prepared.value.project.settings,
      deps: this.deps,
      source: this.cardSource(execution, prepared.value.scanned),
      nextCallId: callIds(execution.run),
      traceId: traceIdOf(execution.run),
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
      await this.log(
        run,
        ERROR_CODES.areaUnknown,
        'An area named in the request is not in the code map.',
        {
          unknown: [...tasks.error.unknown],
          valid: [...tasks.error.valid],
        },
      );
      return stop(failed(ERROR_CODES.areaUnknown));
    }
    const prompts = await this.deps.prompts();
    await updates.update((stored) => ok(recordPromptVersions(stored, promptVersionsOf(prompts))));
    return { ok: true, value: { project, scanned, tasks: tasks.value, prompts } };
  }

  /** RF-200: the newest scan of the project that ended `Completed`. */
  private async latestScan(run: Run): Promise<Run | undefined> {
    const runs = await this.deps.runs.list(run.userId, run.projectId);
    return runs.find((each) => each.stage === 'scan' && each.endState === 'Completed');
  }

  /**
   * ADR-003, RF-405, RF-427, RF-143: the reader's guarded provider, from the provider factory only.
   * A role that cannot be served (no key, unpriced model, no consent) stops the run before a call.
   */
  private async readerOf(
    execution: RunExecution,
    project: Project,
    updates: ManifestUpdates,
  ): Promise<Step<RoleProvider>> {
    const { run, manifest } = execution;
    const account = await this.deps.users.findById(run.userId);
    if (account === undefined) return stop(failed(ERROR_CODES.notFound));
    const scope = scopeOf(run);
    const { manifests, runs } = this.deps;
    const built = await this.deps.providers.build({
      account,
      run: { id: run.id, userId: run.userId, projectId: run.projectId, stage: 'understand' },
      settings: project.settings,
      roles: UNDERSTAND_ROLES,
      cloudConsent: readUnderstandOptions(manifest.options).cloudConsent,
      sinks: {
        ...this.deps.runSinks(scope),
        security: new ManifestSecurityRecorder({ manifests, scope, queue: updates.queue }),
        costs: new ManifestCostRecorder({ manifests, runs, scope, queue: updates.queue }),
        stopRun: (reason) => {
          execution.stop(reason);
        },
      },
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
    return reader === undefined
      ? stop(failed(ERROR_CODES.providerUnavailable))
      : { ok: true, value: reader };
  }

  /** The pinned repository of the citations' permalinks (RF-125). */
  private cardSource(execution: RunExecution, scanned: ScannedSource): CardSource {
    const commitSha = parseCommitSha(scanned.source.commitSha);
    if (!commitSha.ok) {
      throw new RosettaError(ERROR_CODES.codeMapInvalid, 'The scan recorded no valid commit.');
    }
    const { owner, repo } = execution.manifest.source;
    return { owner, repo, commitSha: commitSha.value };
  }

  /** RF-426: `cost.json` and `cost.md` at every end; a write that fails is logged, never thrown. */
  private async writeCostReport(run: Run): Promise<void> {
    try {
      const entries = await this.deps.ledger.runEntries(run.userId, run.id);
      const report = buildCostReport(run.runKey, entries);
      const [first] = entries;
      if (first !== undefined) {
        const priceTable = { version: report.priceTableVersion, currency: first.currency };
        const updates = new ManifestUpdates(this.deps.manifests, scopeOf(run));
        await updates.update((stored) => recordManifestPriceTable(stored, priceTable));
      }
      await this.deps.costReports.write(scopeOf(run), report);
    } catch (error) {
      const code = error instanceof RosettaError ? error.code : ERROR_CODES.costRecordFailed;
      await this.log(run, code, 'The cost report of the run could not be written.', {});
    }
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

/** `<runKey>#<n>`, one numbering for every task of the run. */
function callIds(run: Run): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `${run.runKey}#${String(count)}`;
  };
}
