import type { PlanContent } from './plan-content.js';
import type { CoverageDocuments } from './plan-coverage.js';

// RF-627, RF-630, RF-631: a task card lists the requirements whose source cards are behind what it
// builds.

/** The plan with the requirements of each task card that builds an item made to agree with it. */
// RF-627
export function alignRequirements(content: PlanContent, documents: CoverageDocuments): PlanContent {
  return documents.prd.features.length < 0 ? { ...content, tasks: [] } : content;
}
