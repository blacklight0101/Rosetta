import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { ok } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import { assemblePlan, type PlanAssembly } from '../../domain/planning/plan-content.js';
import { methodPrinciples } from '../../domain/planning/task-method.js';
import { supportedCards } from '../../domain/planning/plan-sources.js';
import { recordManifestBrief } from '../../domain/runs/manifest-brief.js';
import {
  recordManifestCatalogue,
  recordManifestCodeMap,
  recordPromptVersions,
} from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { askPlanner } from '../plan/ask-planner.js';
import { parsePlanAnswer } from '../plan/plan-answer.js';
import { planInputs, type PlanInputDependencies, type PlanInputs } from '../plan/plan-inputs.js';
import { handoffPackageOf } from '../plan/plan-package.js';
import type { CostReportWriter } from '../ports/cost-report-writer.js';
import type { HandoffWriter } from '../ports/handoff-writer.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ProviderSetFactory } from '../ports/provider-set-factory.js';
import type { RunExecution, RunExecutor, RunOutcome } from '../ports/run-executor.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { RoleProvider } from '../providers/provider-set.js';
import { ManifestUpdates } from '../runs/manifest-updates.js';
import { writeCostReport } from '../runs/run-cost-report.js';
import { scopeOf } from '../runs/run-scope.js';
import { runProviderSinks, type RunSinkDependencies } from '../understand/run-sinks.js';

// RF-601..RF-604, RNF-004, ADR-005, ADR-018, DEC-80: the executor of the `plan` stage. It reads the
// project's saved planning brief and the newest completed understand run, records the brief, the
// catalogue version and its SHA-256, and the planner's prompt version in the manifest, asks the
// planner once through the guarded provider the factory builds for the run, checks the answer
// against the supported cards and writes `handoff/`. Only `Supported` claims and answered questions
// reach the planner; the claims left out and the brief's defaults are listed in the package. The
// cost report is written at every end.

export interface BuildPlanDependencies extends PlanInputDependencies, RunSinkDependencies {
  readonly users: UserRepository;
  readonly providers: ProviderSetFactory;
  readonly handoff: HandoffWriter;
  readonly costReports: CostReportWriter;
  /** The principle catalogue the run plans with (RF-606); its version and hash are recorded. */
  readonly catalogue: () => Promise<Catalogue>;
  /** The planner's versioned prompt file (RNF-004). */
  readonly prompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the product requirements document (RF-621). */
  readonly prdPrompt: () => Promise<PromptFile>;
  /** RF-145: the random tag of every data block. */
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
}

const failed = (errorCode: ErrorCode): RunOutcome => ({ endState: 'Failed', errorCode });

export class BuildPlan implements RunExecutor {
  private readonly deps: BuildPlanDependencies;

  constructor(deps: BuildPlanDependencies) {
    this.deps = deps;
  }

  // RF-604, RF-1108
  async execute(execution: RunExecution): Promise<RunOutcome> {
    try {
      return await this.plan(execution);
    } catch (error) {
      if (execution.signal.aborted) return { endState: 'Interrupted' };
      if (!(error instanceof RosettaError)) throw error;
      // RF-422, RF-423: a refusal by the planner's role cap leaves the run's signal alone, but the
      // run did not finish what it was asked to write, so it ends CapReached like any cap stop.
      if (error.code === ERROR_CODES.budgetCapReached) {
        await this.log(execution.run, error.code, 'The planner call would pass a cap.');
        return { endState: 'CapReached', errorCode: error.code };
      }
      await this.log(execution.run, error.code, 'The hand-off package could not be written.');
      return failed(error.code);
    } finally {
      await writeCostReport(this.deps, execution.run);
    }
  }

  private async plan(execution: RunExecution): Promise<RunOutcome> {
    const { run, signal } = execution;
    const inputs = await planInputs(this.deps, run);
    if (!inputs.ok) return this.fail(run, inputs.error.code, inputs.error.message);
    const updates = new ManifestUpdates(this.deps.manifests, scopeOf(run));
    const [catalogue, prompt] = await Promise.all([this.deps.catalogue(), this.deps.prompt()]);
    await this.record(execution, updates, { inputs: inputs.value, catalogue, prompt });
    const planner = await this.plannerOf(execution, inputs.value, updates);
    if (typeof planner === 'string') return failed(planner);
    if (signal.aborted) return { endState: 'Interrupted' };
    const { cards, brief, questions } = inputs.value;
    const supported = supportedCards(cards);
    const answered = questions.filter((question) => question.answer.trim() !== '');
    const call = {
      run,
      planner,
      prompt,
      updates,
      signal,
      tags: () => this.deps.ids.dataBlockTag(),
    };
    const output = await askPlanner(call, { cards: supported, brief, catalogue, answered });
    const assembly = await this.assemble(run, output, {
      supported: supported.map((card) => card.id),
      specificationDriven: brief.principles.includes(methodPrinciples.sdd),
    });
    if (assembly === undefined) {
      const message = 'The planner answer named no requirement with a supported card.';
      return this.fail(run, ERROR_CODES.plannerAnswerInvalid, message);
    }
    const handoff = handoffPackageOf(inputs.value, assembly.content, catalogue);
    await this.deps.handoff.write(scopeOf(run), handoff);
    return { endState: 'Completed' };
  }

  /** RNF-004: the brief, the catalogue, the prompt and the source the package comes from. */
  private async record(
    execution: RunExecution,
    updates: ManifestUpdates,
    used: {
      readonly inputs: PlanInputs;
      readonly catalogue: Catalogue;
      readonly prompt: PromptFile;
    },
  ): Promise<void> {
    const { inputs, catalogue, prompt } = used;
    const { version, sha256 } = catalogue;
    const versions = { [prompt.name]: { version: prompt.version, sha256: prompt.sha256 } };
    await updates.update((manifest) => recordManifestBrief(manifest, inputs.brief));
    await updates.update((manifest) => recordManifestCatalogue(manifest, { version, sha256 }));
    await updates.update((manifest) => ok(recordPromptVersions(manifest, versions)));
    const { sourceRun } = inputs;
    const source = await this.deps.manifests.read(scopeOf(sourceRun));
    const { commitSha, snapshotKey } = sourceRun;
    const snapshotHash = source?.source.snapshotHash ?? null;
    if (commitSha !== null && snapshotKey !== null && snapshotHash !== null)
      await execution.recordSource({ commitSha, snapshotKey, snapshotHash });
    const codemapHash = source?.codemapHash ?? null;
    if (codemapHash !== null)
      await updates.update((manifest) => recordManifestCodeMap(manifest, codemapHash));
  }

  /** The planner's answer checked against the supported cards; undefined when nothing is left. */
  private async assemble(
    run: Run,
    output: string,
    checks: { readonly supported: readonly string[]; readonly specificationDriven: boolean },
  ): Promise<PlanAssembly | undefined> {
    const draft = parsePlanAnswer(output);
    if (draft === undefined) return undefined;
    const { specificationDriven } = checks;
    const assembly = assemblePlan(draft, new Set(checks.supported), { specificationDriven });
    const { requirements, entities, tasks } = assembly.dropped;
    if (requirements + entities + tasks > 0) {
      await this.deps.logger.log({
        ...{ level: 'warn', logger: 'plan', runId: run.runKey, userId: run.userId },
        message: `The planner answer had items without a supported card, a phase or (given SDD) a requirement; ${String(requirements)} requirement(s), ${String(entities)} entity mapping(s) and ${String(tasks)} task card(s) were left out.`,
      });
    }
    return assembly.content.requirements.length === 0 ? undefined : assembly;
  }

  /**
   * ADR-003, RF-143, RF-405: the planner's guarded provider from the factory only, or the code of
   * why it cannot be served (no key, unpriced model, no consent), logged before any call.
   */
  private async plannerOf(
    execution: RunExecution,
    inputs: PlanInputs,
    updates: ManifestUpdates,
  ): Promise<RoleProvider | ErrorCode> {
    const { run, manifest } = execution;
    const account = await this.deps.users.findById(run.userId);
    if (account === undefined) return ERROR_CODES.notFound;
    const built = await this.deps.providers.build({
      account,
      run: { id: run.id, userId: run.userId, projectId: run.projectId, stage: 'plan' },
      settings: inputs.project.settings,
      roles: ['planner'],
      cloudConsent: manifest.options['cloudConsent'] === true,
      sinks: await runProviderSinks(this.deps, execution, updates),
    });
    if (built.ok) return built.value.get('planner') ?? ERROR_CODES.providerUnavailable;
    for (const problem of built.error) {
      const message =
        problem.message ?? `The planner role cannot use provider "${problem.provider}".`;
      await this.log(run, problem.code, message);
    }
    return built.error[0]?.code ?? ERROR_CODES.providerUnavailable;
  }

  private async fail(run: Run, code: ErrorCode, message: string): Promise<RunOutcome> {
    await this.log(run, code, message);
    return failed(code);
  }

  private log(run: Run, code: ErrorCode, message: string): Promise<void> {
    return this.deps.logger.log({
      ...{ level: 'error', logger: 'plan', message, code },
      ...{ runId: run.runKey, userId: run.userId },
    });
  }
}
