import { usableCards } from '../../domain/planning/code-over-documentation.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { ok } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { PlanAssembly } from '../../domain/planning/plan-content.js';
import { methodPrinciples } from '../../domain/planning/task-method.js';
import { recordManifestBrief } from '../../domain/runs/manifest-brief.js';
import { recordManifestSourceRun } from '../../domain/runs/manifest-source-run.js';
import {
  recordManifestCatalogue,
  recordManifestCodeMap,
  recordPromptVersions,
} from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import { askPlanner, type PlannerCall } from '../plan/ask-planner.js';
import { readPlanAnswer } from '../plan/plan-answer.js';
import { draftAfterRepair } from '../plan/plan-repair.js';
import { checkedAssembly } from '../plan/plan-assembly.js';
import { planLinks } from '../plan/plan-links.js';
import { windowOfRole } from '../plan/plan-window.js';
import type { PlanMessageInput } from '../plan/plan-message.js';
import { planDocuments } from '../plan/plan-documents.js';
import { planInputs, type PlanInputDependencies, type PlanInputs } from '../plan/plan-inputs.js';
import { planScanFacts } from '../plan/plan-scan-facts.js';
import type { PlanSecretDependencies } from '../plan/plan-secrets.js';
import { planProposal } from '../plan/plan-proposal.js';
import type { PlanProposal } from '../../domain/planning/stack-proposal.js';
import {
  loadPlanFiles,
  planPromptVersions,
  type PlanFiles,
  type PlanPromptSources,
} from '../plan/plan-prompts.js';
import { handoffPackageOf, leftOutItems } from '../plan/plan-package.js';
import type { CostReportWriter } from '../ports/cost-report-writer.js';
import type { HandoffWriter } from '../ports/handoff-writer.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ProviderSetFactory } from '../ports/provider-set-factory.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { RunExecution, RunExecutor, RunOutcome } from '../ports/run-executor.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { RoleProvider } from '../providers/provider-set.js';
import { callIds } from '../runs/run-ids.js';
import { resolvedSourceOf } from '../plan/resolved-source-of.js';
import { ManifestUpdates } from '../runs/manifest-updates.js';
import { writeCostReport } from '../runs/run-cost-report.js';
import { scopeOf } from '../runs/run-scope.js';
import { runProviderSinks, type RunSinkDependencies } from '../understand/run-sinks.js';

// RF-601..RF-604, RNF-004, ADR-005, ADR-018, DEC-80: the executor of the `plan` stage. It reads the
// saved planning brief and the source understand run (RF-614; else the newest completed one), records
// them with the catalogue and prompt versions, asks the planner through the guarded provider (RF-621,
// RF-623..RF-627 add the PRD, data model, flows, API contract, user interface and task items) and writes
// `handoff/` (an item no card builds: RST-1806). Only `Supported` claims and answered questions reach
// the planner, packed to its window (P3-113). The cost report is written at every end.

export interface BuildPlanDependencies
  extends PlanInputDependencies, PlanPromptSources, PlanSecretDependencies, RunSinkDependencies {
  readonly users: UserRepository;
  /** RF-632: the scan whose files the data shapes are measured from. */
  readonly scans: ScanResults;
  readonly providers: ProviderSetFactory;
  readonly handoff: HandoffWriter;
  readonly costReports: CostReportWriter;
  /** RF-145: the random tag of every data block. */
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
}

interface Finish {
  readonly run: Run;
  readonly call: PlannerCall;
  readonly input: PlanMessageInput;
  readonly assembly: PlanAssembly;
  readonly inputs: PlanInputs;
  readonly files: PlanFiles;
  /** P5-39: what Rosetta proposed; undefined when the scan could not be read. */
  readonly proposal: PlanProposal | undefined;
  /** The scan results the rest of the run reads; the proposal's read is handed on, not repeated. */
  readonly scans: ScanResults;
}

/** The codes whose own message is logged: the cut-off answer (RST-1805) and the prompt size (RST-1522). */
const namesItsCause = new Set<ErrorCode>([
  ERROR_CODES.plannerAnswerCutOff,
  ERROR_CODES.ollamaPromptTooLarge,
]);

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
      return await this.refusedBy(
        execution.run,
        error,
        'The hand-off package could not be written.',
      );
    } finally {
      await writeCostReport(this.deps, execution.run);
    }
  }

  private async plan(execution: RunExecution): Promise<RunOutcome> {
    const { run, signal } = execution;
    const named = execution.manifest.options['sourceRunId'];
    const saved = await planInputs(this.deps, run, named, this.deps.manifests);
    if (!saved.ok) return this.fail(run, saved.error.code, saved.error.message);
    const updates = new ManifestUpdates(this.deps.manifests, scopeOf(run));
    const files = await loadPlanFiles(this.deps, saved.value);
    const { catalogue, prompts } = files;
    await this.record(execution, updates, { inputs: saved.value, files });
    // P5-39: the plan is written from the saved brief with Rosetta's proposals for what it left open.
    const proposed = await planProposal(this.deps, saved.value, catalogue.stack);
    const inputs = { value: proposed.inputs };
    const { proposal } = proposed;
    const planner = await this.plannerOf(execution, inputs.value, updates);
    if (typeof planner === 'string') return failed(planner);
    if (signal.aborted) return { endState: 'Interrupted' };
    const { cards, brief, questions } = inputs.value;
    const supported = usableCards(cards, catalogue.claimVerbs).cards;
    const answered = questions.filter((question) => question.answer.trim() !== '');
    const call = {
      ...{ run, planner, prompt: prompts.plan, agentTaskId: 'planner-package', updates, signal },
      continuePrompt: prompts.continue,
      ...{ tags: () => this.deps.ids.dataBlockTag(), callId: callIds(run) },
      window: windowOfRole(planner, inputs.value.project.settings),
    };
    const input = { cards: supported, brief, catalogue, answered };
    const output = await askPlanner(call, input);
    const draft = await draftAfterRepair(call, input, prompts.planRepair, readPlanAnswer(output));
    if (draft === undefined) {
      const message = 'The planner answer could not be read: no JSON object in it reads as a plan.';
      return this.fail(run, ERROR_CODES.plannerAnswerInvalid, message);
    }
    const assembly = await checkedAssembly(this.deps.logger, run, draft, {
      supported: supported.map((card) => card.id),
      specificationDriven: brief.principles.includes(methodPrinciples.sdd),
    });
    if (assembly === undefined) {
      const message = 'The planner answer named no requirement with a supported card.';
      return this.fail(run, ERROR_CODES.plannerAnswerInvalid, message);
    }
    return this.finish({
      ...{ run, call, input, assembly, files, proposal },
      scans: proposed.scans,
      inputs: inputs.value,
    });
  }

  /** RF-621..RF-627: the documents, the task card links and the package; an unbuilt item: RST-1806. */
  private async finish(parts: Finish): Promise<RunOutcome> {
    const { run, call, input, assembly, inputs, files, proposal } = parts;
    const deps = { ...this.deps, scans: parts.scans };
    const { prompts, examples } = files;
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
    const gapping = { ...linking, prompt: prompts.gap, agentTaskId: 'planner-gap' };
    const specificationDriven = inputs.brief.principles.includes(methodPrinciples.sdd);
    const links = await planLinks(
      { coverage: linking, gap: gapping, repairPrompt: prompts.gapRepair, specificationDriven },
      { content: assembly.content, documents },
    );
    const covered = links.planned;
    for (const message of links.warnings) await warn(message);
    const facts = await planScanFacts(deps, inputs, prompts.secretRisk.text);
    const handoff = handoffPackageOf(inputs, covered.content, input.catalogue, {
      ...{ ...documents, ...facts, examples, proposal },
      leftOut: leftOutItems({ ...assembly, dataModelProblems: documents.dataModelProblems }),
    });
    await this.deps.handoff.write(scopeOf(run), handoff);
    // Q-45: the extra call was refused or failed; the package of the first call stays as it is.
    if (links.refusal !== undefined) {
      const message =
        'The package was written, but the task cards for the items no card builds could not be asked for.';
      return this.refusedBy(run, links.refusal, message);
    }
    const gaps = covered.report.uncovered.length;
    if (gaps === 0) return { endState: 'Completed' };
    const message = `The package was written, but ${String(gaps)} item(s) are built by no task card; see checks.md.`;
    return this.fail(run, ERROR_CODES.planCoverageGap, message);
  }

  /**
   * RF-422, RF-423: a refusal by the planner's role cap leaves the run's signal alone, but the run
   * did not finish what it was asked to write, so it ends CapReached like any cap stop. RF-401: the
   * messages of the cut-off answer and of the prompt size name sizes and settings, never prompt text.
   */
  private async refusedBy(run: Run, error: RosettaError, fallback: string): Promise<RunOutcome> {
    if (error.code === ERROR_CODES.budgetCapReached) {
      await this.log(run, error.code, 'The planner call would pass a cap.');
      return { endState: 'CapReached', errorCode: error.code };
    }
    await this.log(run, error.code, namesItsCause.has(error.code) ? error.message : fallback);
    return failed(error.code);
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
      readonly files: PlanFiles;
    },
  ): Promise<void> {
    const { inputs, files } = used;
    const { version, sha256 } = files.catalogue;
    const versions = planPromptVersions(files);
    await updates.update((manifest) => recordManifestBrief(manifest, inputs.brief));
    await updates.update((manifest) => recordManifestSourceRun(manifest, inputs.sourceRun.runKey));
    await updates.update((manifest) => recordManifestCatalogue(manifest, { version, sha256 }));
    await updates.update((manifest) => ok(recordPromptVersions(manifest, versions)));
    const source = await this.deps.manifests.read(scopeOf(inputs.sourceRun));
    // RF-130: an upload run has a snapshot and no commit.
    const resolved = resolvedSourceOf(inputs.sourceRun, source);
    if (resolved !== undefined) await execution.recordSource(resolved);
    const codemapHash = source?.codemapHash ?? null;
    if (codemapHash !== null)
      await updates.update((manifest) => recordManifestCodeMap(manifest, codemapHash));
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
