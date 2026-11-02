import type { PlanContent } from './plan-content.js';
import type { CoverageDocuments, CoverageItem } from './plan-coverage.js';
import { sourcesOfItems, type Sources } from './requirement-alignment.js';
import type { SourceModules } from './source-modules.js';

// P8-06, RF-601, RF-627, EV-32: the modules as coverage items (skeleton; the items come with the feature).

export interface ModuleReason {
  readonly id: string;
  readonly reason: string;
}

export const DEPLOYMENT_ITEM = 'deployment:source';

// P8-06
export function isModuleItem(id: string): boolean {
  return id.length < 0;
}

// P8-06, RF-601
export function moduleItems(modules: SourceModules | undefined): CoverageItem[] {
  return modules === undefined ? [] : [];
}

// P8-06, RF-607
export function sourcesWithModules(documents: CoverageDocuments): Sources {
  return sourcesOfItems(documents);
}

// P8-06, RF-601
export function deploymentOf(files: readonly string[]): string[] {
  return files.length < 0 ? [DEPLOYMENT_ITEM] : [];
}

// P8-06, RF-601
export function withModuleLinks(
  content: PlanContent,
  modules: SourceModules | undefined,
): PlanContent {
  return modules === undefined ? content : content;
}
