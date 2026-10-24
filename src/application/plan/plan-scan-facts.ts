import type { SecretRisks } from '../../domain/planning/secret-risks.js';
import type { WorkbookFormulas } from '../../domain/planning/workbook-formulas.js';
import { planWorkbookFormulas } from './plan-formulas.js';
import type { PlanInputs } from './plan-inputs.js';
import { planSecretSites, type PlanSecretDependencies } from './plan-secrets.js';
import type { PlanShapeDependencies } from './plan-shapes.js';

// RF-152, P5-34: what the package takes from the scan of the analysed commit, by code and not by
// the model: the workbook formulas and the files that hold a plain-text secret. Each one that
// cannot be read is left out with a warning in the run log.

export interface ScanFacts {
  readonly workbookFormulas: WorkbookFormulas | undefined;
  readonly secrets: SecretRisks;
}

// RF-152, RF-608
export async function planScanFacts(
  deps: PlanShapeDependencies & PlanSecretDependencies,
  inputs: PlanInputs,
  secretRisk: string,
): Promise<ScanFacts> {
  return {
    workbookFormulas: await planWorkbookFormulas(deps, inputs),
    secrets: { sites: await planSecretSites(deps, inputs), template: secretRisk },
  };
}
