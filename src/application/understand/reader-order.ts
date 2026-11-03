import type { Area } from '../../domain/code-map/area.js';
import type { ReadingPriority } from '../../domain/code-map/reading-priority.js';

// RF-210, DEC-195, EV-68: the order in which readers take the areas of a run. The application's
// own code comes first, then tests, then deployment and infrastructure, then configuration and
// generated folders, then library areas. Within a kind the code map's order is kept, so a run is
// reproducible against its recordings; only inside the own code, DEC-216 adds two keys before it: an
// area with an entry point first, then the larger first-party token count (UX-23, EV-76). The kind comes from the folder names of the area, and only
// clear names count: a `Setup`, `VM` or `Azure` folder is own code, and an ambiguous name such as
// `config` or `github` counts only as the top folder. No stack-specific logic.

const OWN = 0;
const TESTS = 1;
const DEPLOYMENT = 2;
const CONFIGURATION = 3;
const LIBRARY = 4;

/** Clear deployment words, matched as a whole part of a folder name at any depth. */
const DEPLOYMENT_PARTS: ReadonlySet<string> = new Set([
  ...['deploy', 'deployment', 'deployments', 'k8s', 'kubernetes', 'kube', 'docker'],
  ...['helm', 'terraform'],
]);
/** Clear multi-word names, found in the squeezed folder name at any depth. */
const DEPLOYMENT_PHRASES: readonly string[] = ['servicefabric', 'azurepipelines'];
/** Ambiguous names: they count only as the top folder (`src/infrastructure/github` is code). */
const TOP_DEPLOYMENT: ReadonlySet<string> = new Set(['infra', 'charts', 'pipelines', 'github']);
const TOP_CONFIGURATION: ReadonlySet<string> = new Set(['config', 'configs', 'configuration']);
const CONFIGURATION_FOLDERS: ReadonlySet<string> = new Set(['conf', 'generated', 'obj', 'bin']);
const TEST_PARTS: ReadonlySet<string> = new Set(['test', 'tests', 'spec', 'specs', 'e2e']);
/** `CatalogTests`, `Catalog.Tests`: a capital `T` after a letter or digit; never `contest`. */
const TEST_SUFFIX = /[a-z0-9]Tests?$/u;

/** `Kubernetes-DockerForWindows` -> kubernetes, docker, for, windows: split on punctuation and case. */
function partsOf(folder: string): readonly string[] {
  const spaced = folder.replace(/([a-z0-9])([A-Z])/gu, '$1 $2');
  return spaced
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((part) => part !== '');
}

function kindOfFolder(folder: string, isTop: boolean): number {
  const squeezed = folder.toLowerCase().replace(/[^a-z0-9]+/gu, '');
  const parts = partsOf(folder);
  if (parts.some((part) => DEPLOYMENT_PARTS.has(part))) return DEPLOYMENT;
  if (DEPLOYMENT_PHRASES.some((phrase) => squeezed.includes(phrase))) return DEPLOYMENT;
  if (isTop && TOP_DEPLOYMENT.has(squeezed)) return DEPLOYMENT;
  if (CONFIGURATION_FOLDERS.has(squeezed) || (isTop && TOP_CONFIGURATION.has(squeezed))) {
    return CONFIGURATION;
  }
  return parts.some((part) => TEST_PARTS.has(part)) || TEST_SUFFIX.test(folder) ? TESTS : OWN;
}

/** The kind of an area: the last (least important) kind any folder of its name has. */
function kindOf(area: Area, library: ReadonlySet<string>): number {
  if (library.has(area.name)) return LIBRARY;
  // `Scripts#8` is the eighth part of a split folder: the part number is not a folder name.
  const folders = area.name.replace(/#\d+$/u, '').split('/');
  return Math.max(OWN, ...folders.map((folder, index) => kindOfFolder(folder, index === 0)));
}

const NONE = { entryPoint: false, firstPartyTokens: 0 };

interface Ranked {
  readonly area: Area;
  readonly kind: number;
  readonly entryPoint: boolean;
  readonly firstPartyTokens: number;
}

/** The kind, then (own code only) the entry point and the size; equal keys keep the input order. */
function compareRanked(a: Ranked, b: Ranked): number {
  if (a.kind !== b.kind) return a.kind - b.kind;
  if (a.kind !== OWN) return 0;
  if (a.entryPoint !== b.entryPoint) return a.entryPoint ? -1 : 1;
  return b.firstPartyTokens - a.firstPartyTokens;
}

/**
 * RF-210, DEC-216: the areas in reading order. The input order breaks ties (the sort is stable);
 * an area the priority does not list counts as having no entry point and no tokens.
 */
export function readingOrder(
  areas: readonly Area[],
  library: ReadonlySet<string>,
  priority: ReadingPriority = new Map(),
): readonly Area[] {
  const ranked = areas.map((area) => ({
    area,
    kind: kindOf(area, library),
    ...(priority.get(area.name) ?? NONE),
  }));
  return ranked.sort(compareRanked).map((each) => each.area);
}
