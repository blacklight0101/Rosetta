import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { ok } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import { assemblePlan, type PlanAssembly } from '../../domain/planning/plan-content.js';
import { methodPrinciples } from '../../domain/planning/task-method.js';
import { supportedCards } from '../../domain/planning/plan-sources.js';
import { recordManifestBrief } from '../../domain/runs/manifest-brief.js';
import { recordManifestSourceRun } from '../../domain/runs/manifest-source-run.js';
import {
  recordManifestCatalogue,
  recordManifestCodeMap,
  recordPromptVersions,
} from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { askPlanner, type PlannerCall } from '../plan/ask-planner.js';
import { parsePlanAnswer } from '../plan/plan-answer.js';
import { coverageWarnings, planCoverage } from '../plan/plan-coverage.js';
import type { PlanMessageInput } from '../plan/plan-message.js';
import { planDocuments, type DocumentPrompts } from '../plan/plan-documents.js';
import { planInputs, type PlanInputDependencies, type PlanInputs } from '../plan/plan-inputs.js';
import { planShapes } from '../plan/plan-shapes.js';
import { handoffPackageOf } from '../plan/plan-package.js';
import type { CostReportWriter } from '../ports/cost-report-writer.js';
import type { HandoffWriter } from '../ports/handoff-writer.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ProviderSetFactory } from '../ports/provider-set-factory.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { RunExecution, RunExecutor, RunOutcome } from '../ports/run-executor.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { RoleProvider } from '../providers/provider-set.js';
import { callIds } from '../runs/run-ids.js';
import { ManifestUpdates } from '../runs/manifest-updates.js';
import { writeCostReport } from '../runs/run-cost-report.js';
import { scopeOf } from '../runs/run-scope.js';
import { runProviderSinks, type RunSinkDependencies } from '../understand/run-sinks.js';

// RF-601..RF-604, RNF-004, ADR-005, ADR-018, DEC-80: the executor of the `plan` stage. It reads the
// saved planning brief and the source understand run (RF-614; else the newest completed one), records
// them with the catalogue and prompt versions, asks the planner through the guarded provider (RF-621,
// RF-623..RF-627 add the PRD, data model, flows, API contract, user interface and task items) and writes
// `handoff/` (an item no card builds: RST-1806). Only `Supported` claims and answered questions reach
// the planner. The cost report is written at every end.

export interface BuildPlanDependencies extends PlanInputDependencies, RunSinkDependencies {
  readonly users: UserRepository;
  /** RF-632: the scan whose files the data shapes are measured from. */
  readonly scans: ScanResults;
  readonly providers: ProviderSetFactory;
  readonly handoff: HandoffWriter;
  readonly costReports: CostReportWriter;
  /** The principle catalogue the run plans with (RF-606); its version and hash are recorded. */
  readonly catalogue: () => Promise<Catalogue>;
  /** The planner's versioned prompt file (RNF-004). */
  readonly prompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the product requirements document (RF-621). */
  readonly prdPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the target data model (RF-623). */
  readonly dataModelPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the target flows (RF-625). */
  readonly flowsPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the API contract (RF-624). */
  readonly apiContractPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file that asks a cut-off answer to continue (RF-604). */
  readonly continuePrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the user-interface material (RF-626). */
  readonly uxPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the links of the task cards to the items (RF-627). */
  readonly coveragePrompt: () => Promise<PromptFile>;
  /** RF-145: the random tag of every data block. */
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
}

type PlanPrompts = Readonly<
  Record<keyof DocumentPrompts | 'plan' | 'coverage' | 'continue', PromptFile>
>;

interface Finish {
  readonly run: Run;
  readonly call: PlannerCall;
  readonly input: PlanMessageInput;
  readonly assembly: PlanAssembly;
  readonly inputs: PlanInputs;
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
      const cutOff = error.code === ERROR_CODES.plannerAnswerCutOff;
      const message = cutOff ? error.message : 'The hand-off package could not be written.';
      await this.log(execution.run, error.code, message);
      return failed(error.code);
    } finally {
      await writeCostReport(this.deps, execution.run);
    }
  }

  private async plan(execution: RunExecution): Promise<RunOutcome> {
    const { run, signal } = execution;
    const named = execution.manifest.options['sourceRunId'];
    const inputs = await planInputs(this.deps, run, named, this.deps.manifests);
    if (!inputs.ok) return this.fail(run, inputs.error.code, inputs.error.message);
    const updates = new ManifestUpdates(this.deps.manifests, scopeOf(run));
    const { catalogue, prompts } = await this.loadFiles();
    await this.record(execution, updates, { inputs: inputs.value, catalogue, prompts });
    const planner = await this.plannerOf(execution, inputs.value, updates);
    if (typeof planner === 'string') return failed(planner);
    if (signal.aborted) return { endState: 'Interrupted' };
    const { cards, brief, questions } = inputs.value;
    const supported = supportedCards(cards);
    const answered = questions.filter((question) => question.answer.trim() !== '');
    const call = {
      ...{ run, planner, prompt: prompts.plan, agentTaskId: 'planner-package', updates, signal },
      continuePrompt: prompts.continue,
      tags: () => this.deps.ids.dataBlockTag(),
      callId: callIds(run),
    };
    const input = { cards: supported, brief, catalogue, answered };
    const output = await askPlanner(call, input);
    const assembly = await this.assemble(run, output, {
      supported: supported.map((card) => card.id),
      specificationDriven: brief.principles.includes(methodPrinciples.sdd),
    });
    if (assembly === undefined) {
      const message = 'The planner answer named no requirement with a supported card.';
      return this.fail(run, ERROR_CODES.plannerAnswerInvalid, message);
    }
    return this.finish({ ...{ run, call, input, assembly }, inputs: inputs.value }, prompts);
  }

  /**
   * RF-621..RF-627: the documents, the links of the task cards to the items they build, and the
   * package. An item no task card builds is listed in checks.md and ends the run RST-1806.
   */
  private async finish(parts: Finish, prompts: PlanPrompts): Promise<RunOutcome> {
    const { run, call, input, assembly, inputs } = parts;
    const warn = (message: string): Promise<void> => this.warn(run, message);
    const documents = await planDocuments(
      call,
      prompts,
      { ...input, components: assembly.content.components },
      warn,
    );
    const linking = {
      ...{ ...call, onCutOff: warn },
      ...{ prompt: prompts.coverage, agentTaskId: 'planner-coverage' },
    };
    const covered = await planCoverage(linking, { content: assembly.content, documents });
    for (const message of coverageWarnings(covered)) await warn(message);
    const shapes = await planShapes(this.deps, inputs);
    const handoff = handoffPackageOf(inputs, covered.content, input.catalogue, {
      ...documents,
      shapes,
    });
    await this.deps.handoff.write(scopeOf(run), handoff);
    const gaps = covered.report.uncovered.length;
    if (gaps === 0) return { endState: 'Completed' };
    const message = `The package was written, but ${String(gaps)} item(s) are built by no task card; see checks.md.`;
    return this.fail(run, ERROR_CODES.planCoverageGap, message);
  }

  /** The principle catalogue and the planner's versioned prompts, read for this run. */
  private async loadFiles(): Promise<{ catalogue: Catalogue; prompts: PlanPrompts }> {
    const { catalogue, prompt, prdPrompt, dataModelPrompt, flowsPrompt } = this.deps;
    const [loaded, plan, prd, dataModel, flows, apiContract, ux, coverage, cont] =
      await Promise.all([
        catalogue(),
        prompt(),
        prdPrompt(),
        dataModelPrompt(),
        flowsPrompt(),
        this.deps.apiContractPrompt(),
        this.deps.uxPrompt(),
        this.deps.coveragePrompt(),
        this.deps.continuePrompt(),
      ]);
    const prompts = { plan, prd, dataModel, flows, apiContract, ux, coverage, continue: cont };
    return { catalogue: loaded, prompts };
  }

  private warn(run: Run, message: string): Promise<void> {
    return this.deps.logger.log({
      ...{ level: 'warn', logger: 'plan', runId: run.runKey, userId: run.userId },
      message,
    });
  }

  /** RNF-004: the brief, the catalogue, the prompts and the source the package comes from. */
  private async record(
    execution: RunExecution,
    updates: ManifestUpdates,
    used: {
      readonly inputs: PlanInputs;
      readonly catalogue: Catalogue;
      readonly prompts: PlanPrompts;
    },
  ): Promise<void> {
    const { inputs, catalogue, prompts } = used;
    const { version, sha256 } = catalogue;
    const versions = Object.fromEntries(
      Object.values(prompts).map((file) => [
        file.name,
        { version: file.version, sha256: file.sha256 },
      ]),
    );
    await updates.update((manifest) => recordManifestBrief(manifest, inputs.brief));
    await updates.update((manifest) => recordManifestSourceRun(manifest, inputs.sourceRun.runKey));
    await updates.update((manifest) => recordManifestCatalogue(manifest, { version, sha256 }));
    await updates.update((manifest) => ok(recordPromptVersions(manifest, versions)));
    const source = await this.deps.manifests.read(scopeOf(inputs.sourceRun));
    const { commitSha, snapshotKey } = inputs.sourceRun;
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
    const { requirements, entities, tasks, technical } = assembly.dropped;
    if (requirements + entities + tasks + technical > 0) {
      await this.deps.logger.log({
        ...{ level: 'warn', logger: 'plan', runId: run.runKey, userId: run.userId },
        message: `The planner answer had items without a supported card, a phase or (given SDD) a requirement; ${String(requirements)} requirement(s), ${String(entities)} entity mapping(s), ${String(tasks)} task card(s) and ${String(technical)} technical item(s) were left out.`,
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
