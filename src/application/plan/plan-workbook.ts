import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { scanOfSourceRun, type PlanShapeDependencies } from './plan-shapes.js';
import type { PlanInputs } from './plan-inputs.js';

// RF-155, RFC-005 section 4.7, RNF-004: whether a plan run plans the rebuild of workbooks, and the
// planner prompt with the workbook guidance after it. A project of Excel workbooks always does; a
// project of a zip does when the scan of the snapshot its source run read lists rendered workbooks;
// a GitHub project never does, so its prompt is the one of before. A scan that cannot be read is
// logged and leaves the zip without guidance.

/** The guidance this run adds, or undefined when its source holds no workbook. */
export async function workbookGuidanceFor(
  deps: PlanShapeDependencies & { readonly workbookPrompt: () => Promise<PromptFile> },
  inputs: PlanInputs,
): Promise<PromptFile | undefined> {
  const { project, sourceRun } = inputs;
  if (project.sourceKind === 'workbook') return deps.workbookPrompt();
  if (project.sourceKind !== 'upload') return undefined;
  const scan = await scanOfSourceRun(deps, inputs);
  if (scan === undefined) return undefined;
  try {
    const { workbookFolders } = await deps.scans.open(scan);
    return workbookFolders === undefined || workbookFolders.length === 0
      ? undefined
      : await deps.workbookPrompt();
  } catch (error) {
    await deps.logger.log({
      ...{ level: 'warn', logger: 'plan', runId: sourceRun.runKey, userId: project.userId },
      code: error instanceof RosettaError ? error.code : ERROR_CODES.codeMapMissing,
      message: 'The scan could not be read, so the plan has no workbook guidance.',
    });
    return undefined;
  }
}

/** The planner prompt with the guidance after it; the same file when there is none. */
export function withWorkbookGuidance(
  prompt: PromptFile,
  guidance: PromptFile | undefined,
): PromptFile {
  if (guidance === undefined) return prompt;
  return {
    ...prompt,
    text: `${prompt.text.trimEnd()}

${guidance.text.trim()}
`,
  };
}
