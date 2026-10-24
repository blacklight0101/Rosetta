import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { DocumentPrompts } from './plan-documents.js';
import type { PlanInputs } from './plan-inputs.js';
import type { PlanShapeDependencies } from './plan-shapes.js';
import { workbookGuidanceFor, withWorkbookGuidance } from './plan-workbook.js';

// RF-604, RF-621..RF-627, RF-155, RNF-004: the principle catalogue and the planner's versioned prompt
// files a plan run reads, and the versions it records. The package prompt carries the workbook
// guidance after it when the run plans the rebuild of workbooks; every other prompt is as it was.

/** Where a plan run reads its versioned files from. */
export interface PlanPromptSources {
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
  /** The planner's versioned prompt file for the task cards of the items no card builds (Q-45). */
  readonly gapPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the one repair attempt of the gap call (Q-54). */
  readonly gapRepairPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the one repair attempt of the plan answer (P3-126). */
  readonly planRepairPrompt: () => Promise<PromptFile>;
  /** The wording of the plan risk for a file that holds a masked secret (P5-34, RF-608). */
  readonly secretRiskPrompt: () => Promise<PromptFile>;
  /**
   * P3-117: the text of every planner prompt file of every version, for the check of copied
   * examples; the prompts of the run alone when absent.
   */
  readonly promptTexts?: () => Promise<readonly string[]>;
  /** The planner's workbook guidance, added to the package prompt of a workbook plan (RF-155). */
  readonly workbookPrompt: () => Promise<PromptFile>;
}

type PlanPrompts = Readonly<
  Record<
    | keyof DocumentPrompts
    | 'plan'
    | 'coverage'
    | 'gap'
    | 'gapRepair'
    | 'planRepair'
    | 'continue'
    | 'secretRisk',
    PromptFile
  >
>;

export interface PlanFiles {
  readonly catalogue: Catalogue;
  /** `plan` already holds the workbook guidance when `guidance` is set. */
  readonly prompts: PlanPrompts;
  readonly guidance?: PromptFile;
  /** P3-117: the texts the example sentences of the package check are read from. */
  readonly examples: readonly string[];
}

/** The catalogue and the prompts of this run's source, read once. */
// RF-604, RF-155
export async function loadPlanFiles(
  sources: PlanPromptSources & PlanShapeDependencies,
  inputs: PlanInputs,
): Promise<PlanFiles> {
  const [
    catalogue,
    plan,
    prd,
    dataModel,
    flows,
    apiContract,
    ux,
    coverage,
    gap,
    gapRepair,
    cont,
    planRepair,
    secretRisk,
  ] = await Promise.all([
    sources.catalogue(),
    sources.prompt(),
    sources.prdPrompt(),
    sources.dataModelPrompt(),
    sources.flowsPrompt(),
    sources.apiContractPrompt(),
    sources.uxPrompt(),
    sources.coveragePrompt(),
    sources.gapPrompt(),
    sources.gapRepairPrompt(),
    sources.continuePrompt(),
    sources.planRepairPrompt(),
    sources.secretRiskPrompt(),
  ]);
  const guidance = await workbookGuidanceFor(sources, inputs);
  const older = (await sources.promptTexts?.()) ?? [];
  const prompts = {
    ...{ plan: withWorkbookGuidance(plan, guidance), prd, dataModel, flows },
    ...{ apiContract, ux, coverage, gap, gapRepair, planRepair, secretRisk, continue: cont },
  };
  const examples = [...Object.values(prompts).map((file) => file.text), ...older];
  return { catalogue, prompts, examples, ...(guidance === undefined ? {} : { guidance }) };
}

/** RNF-004: the version and hash of every prompt file the run used, by file name. */
export function planPromptVersions(
  files: Pick<PlanFiles, 'prompts' | 'guidance'>,
): Record<string, { readonly version: string; readonly sha256: string }> {
  const used = [...Object.values(files.prompts), ...(files.guidance ? [files.guidance] : [])];
  return Object.fromEntries(
    used.map((file) => [file.name, { version: file.version, sha256: file.sha256 }]),
  );
}
