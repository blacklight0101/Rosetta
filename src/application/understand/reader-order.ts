import type { Area } from '../../domain/code-map/area.js';

// RF-210, DEC-195, EV-68: the order in which readers take the areas of a run. The application's
// own code comes first, then tests, then deployment and infrastructure, then configuration and
// generated folders, then library areas. Within a kind the code map's order is kept, so a run is
// reproducible against its recordings. The kind comes from the folder names of the area, and only
// clear names count: a `Setup`, `VM` or `Azure` folder is own code. No stack-specific logic.

const OWN = 0;
const TESTS = 1;
const DEPLOYMENT = 2;
const CONFIGURATION = 3;
const LIBRARY = 4;

/** Whole folder names, compared without case, dots, dashes, underscores and spaces. */
const DEPLOYMENT_FOLDERS: ReadonlySet<string> = new Set([
  ...['deploy', 'deployment', 'deployments', 'k8s', 'kubernetes', 'kube', 'docker', 'helm'],
  ...['charts', 'terraform', 'infra', 'github', 'azurepipelines', 'pipelines'],
]);
const CONFIGURATION_FOLDERS: ReadonlySet<string> = new Set([
  ...['config', 'configs', 'configuration', 'conf', 'generated', 'gen', 'obj', 'bin'],
]);
const TEST_FOLDERS: ReadonlySet<string> = new Set(['test', 'tests', 'spec', 'specs', 'e2e']);

function kindOfFolder(folder: string): number {
  const name = folder.toLowerCase().replace(/[^a-z0-9]+/gu, '');
  if (DEPLOYMENT_FOLDERS.has(name)) return DEPLOYMENT;
  if (CONFIGURATION_FOLDERS.has(name)) return CONFIGURATION;
  return TEST_FOLDERS.has(name) || /tests?$/u.test(name) ? TESTS : OWN;
}

/** The kind of an area: the last (least important) kind any folder of its name has. */
function kindOf(area: Area, library: ReadonlySet<string>): number {
  if (library.has(area.name)) return LIBRARY;
  // `Scripts#8` is the eighth part of a split folder: the part number is not a folder name.
  const folders = area.name.replace(/#\d+$/u, '').split('/');
  return Math.max(OWN, ...folders.map(kindOfFolder));
}

/** RF-210: the areas in reading order; the input order breaks ties (the sort is stable). */
export function readingOrder(
  areas: readonly Area[],
  library: ReadonlySet<string>,
): readonly Area[] {
  const kinds = new Map(areas.map((area) => [area.name, kindOf(area, library)]));
  return [...areas].sort((a, b) => (kinds.get(a.name) ?? OWN) - (kinds.get(b.name) ?? OWN));
}
