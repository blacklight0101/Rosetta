import type { CoverageDocuments, CoverageItem } from './plan-coverage.js';
import { sourcesOfItems, type Sources } from './requirement-alignment.js';
import type { SourceModules } from './source-modules.js';

// P8-06, RF-601, RF-627, EV-32: the modules of the source and its deployment material as items the
// task cards cover, beside the items of the documents. A module is `module:<folder>` and the
// deployment material is the one item `deployment:source`. A task card touches a module only when
// the planner links it by its id: a requirement's source cards are no proof, since a small model
// lists every requirement on every card (the recorded Ollama eShop plan) and a merged card describes
// several apps at once, so in doubt the module is asked for in the gap round. The deployment
// material is the same: only the planner's link by id covers it, since a card that writes the new
// repository's own CI file or Dockerfile does not port the legacy Kubernetes or Service Fabric
// deployment. A module no card touches goes to the gap round and, if still untouched, is named in
// checks.md with the reason; it never fails the run, unlike the items of the documents.

/** Why a module or the deployment material has no task card, written by Rosetta. */
export interface ModuleReason {
  readonly id: string;
  readonly reason: string;
}

/** The id of the one deployment item. */
export const DEPLOYMENT_ITEM = 'deployment:source';

/** True for the id of a module or of the deployment material. */
// P8-06
export function isModuleItem(id: string): boolean {
  return id.startsWith('module:') || id === DEPLOYMENT_ITEM;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/** The items of the modules sent to the planner and of the deployment material, in that order. */
// P8-06, RF-601
export function moduleItems(modules: SourceModules | undefined): CoverageItem[] {
  if (modules === undefined) return [];
  const items: CoverageItem[] = modules.modules.map((each) => ({
    id: `module:${each.path}`,
    kind: 'module',
    name: each.path,
    detail: [
      `Project files: ${each.manifests.join(', ')}`,
      `languages: ${each.languages.length === 0 ? 'none known' : each.languages.join(', ')}`,
      plural(each.files, 'file'),
    ].join('; '),
  }));
  const { deployment } = modules;
  if (deployment === undefined) return items;
  const detail = `${deployment.paths.join(', ')}; ${plural(deployment.files, 'file')}`;
  return [
    ...items,
    { id: DEPLOYMENT_ITEM, kind: 'deployment', name: 'Deployment material', detail },
  ];
}

/** The source cards behind each module item, for the requirements of a gap card (P7-14). */
function moduleSources(modules: SourceModules | undefined): Map<string, ReadonlySet<string>> {
  const sources = new Map<string, ReadonlySet<string>>();
  for (const each of modules?.modules ?? [])
    sources.set(`module:${each.path}`, new Set(each.cards));
  if (modules?.deployment !== undefined) {
    sources.set(DEPLOYMENT_ITEM, new Set(modules.deployment.cards));
  }
  return sources;
}

/** The source cards behind every item, those of the modules included (gap and derived requirements). */
// P8-06, RF-607
export function sourcesWithModules(documents: CoverageDocuments): Sources {
  const all = new Map(sourcesOfItems(documents));
  for (const [id, cards] of moduleSources(documents.modules)) all.set(id, cards);
  return all;
}
