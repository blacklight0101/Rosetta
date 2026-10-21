import type { WorkbookFormulas } from '../../domain/planning/workbook-formulas.js';
import type { PlanInputs } from './plan-inputs.js';
import type { PlanShapeDependencies } from './plan-shapes.js';

// RF-152, RF-155, P3-94: the formulas of the rendered workbooks of the source run, read from its scan.

/* eslint-disable @typescript-eslint/no-unused-vars -- a stub the next commit replaces */
export function planWorkbookFormulas(
  _deps: PlanShapeDependencies,
  _inputs: Pick<PlanInputs, 'project' | 'sourceRun'>,
): Promise<WorkbookFormulas | undefined> {
  return Promise.resolve(undefined);
}
