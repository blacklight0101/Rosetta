import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { FileEntry } from '../code-map/file-entry.js';
import { deploymentRootOf, isCiFile } from './deployment-paths.js';
import { isTestManifest, notModuleReason, type NotModule } from './module-folder-rules.js';
import type { SourceCard } from './plan-sources.js';

// P8-06, RF-601, EV-32: the modules of the analysed source, read from its scan by code. A module is
// a folder that holds a project or package manifest (the scan tags it `manifest`, by its file name,
// for every stack); each file belongs to the deepest module folder that holds it. Deployment
// material (deployment-paths.ts) is not a module: it is one whole, so the plan gives it one
// deployment card or says why not. Each module and the deployment material list their own source
// cards: those whose Supported claims cite their files and no file of another module. A card that
// describes several apps at once (a setting shared by the MVC and the WebForms app) is no module's
// own, so a task card built from it does not count as the work on each app: in doubt the module is
// asked for in the gap round. Every list is in a fixed order; at most `MAX_MODULES` modules,
// the largest first, reach the planner and the others are kept apart and named in checks.md.

/** The most modules sent to the planner as items; the others are listed as over the cap. */
export const MAX_MODULES = 60;

/** The most deployment folders and files named in the detail of the deployment item. */
const MAX_DEPLOYMENT_PATHS = 20;

/** The most languages named for one module, by lines. */
const MAX_LANGUAGES = 3;

export interface SourceModule {
  /** The folder of the manifest, relative with forward slashes; `.` for the root. */
  readonly path: string;
  /** The file names of the manifests in the folder, sorted. */
  readonly manifests: readonly string[];
  /** The languages of its files by lines, most first. */
  readonly languages: readonly string[];
  readonly files: number;
  /** Its own source cards: their Supported claims cite its files and no other module's, sorted. */
  readonly cards: readonly string[];
}

interface DeploymentMaterial {
  /** The deployment folders and the files outside them, sorted; at most 20. */
  readonly paths: readonly string[];
  readonly files: number;
  readonly cards: readonly string[];
}

export interface SourceModules {
  /** The modules the planner is given, by path. */
  readonly modules: readonly SourceModule[];
  /** The modules over the cap, by path; checks.md names them. */
  readonly overCap: readonly SourceModule[];
  readonly deployment?: DeploymentMaterial;
  /** P8-06: the manifest folders that are test projects or vendored code, named in checks.md. */
  readonly notModules?: readonly NotModule[];
  /** P8-06: the CI files, which may only build and test, so they are named and not counted. */
  readonly ciFiles?: readonly string[];
  /** P8-06 skeleton: deployment-like files counted nowhere. */
  readonly deploymentLike?: readonly string[];
  /** P8-06 skeleton: deploy folders counted as modules. */
  readonly deployModules?: readonly string[];
}

interface Tally {
  readonly manifests: Set<string>;
  readonly lines: Map<string, number>;
  files: number;
  readonly cards: Set<string>;
}

function folderOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '.' : path.slice(0, at);
}

function within(path: string, folder: string): boolean {
  return folder === '.' || path.startsWith(`${folder}/`);
}

function newTally(): Tally {
  return { manifests: new Set(), lines: new Map(), files: 0, cards: new Set() };
}

interface Folders {
  /** Every folder with a manifest, test and vendored ones included. */
  readonly manifests: ReadonlySet<string>;
  /** The module folders, deepest first. */
  readonly modules: Map<string, Tally>;
  readonly notModules: NotModule[];
}

function manifestNames(files: readonly FileEntry[]): Map<string, FileEntry[]> {
  const folders = new Map<string, FileEntry[]>();
  for (const file of files) {
    if (!file.artefactKinds.includes('manifest')) continue;
    const folder = folderOf(file.path);
    folders.set(folder, [...(folders.get(folder) ?? []), file]);
  }
  return folders;
}

/**
 * The module folders: every folder with a manifest that is no test project, no vendored code and
 * not inside deployment material. A test or vendored folder is kept apart with its reason.
 */
function moduleFolders(files: readonly FileEntry[]): Folders {
  const named = manifestNames(files);
  const manifests = new Set(named.keys());
  const modules = new Map<string, Tally>();
  const notModules: NotModule[] = [];
  for (const [folder, entries] of named) {
    const names = entries.map((each) => each.path.slice(each.path.lastIndexOf('/') + 1));
    const vendored = entries.some((each) => each.vendored === true);
    const reason =
      notModuleReason(folder, vendored) ?? (names.some(isTestManifest) ? 'test' : undefined);
    if (reason !== undefined) {
      notModules.push({ path: folder, reason });
      continue;
    }
    if (entries.some((each) => deploymentRootOf(each.path, manifests) !== undefined)) continue;
    const tally = newTally();
    for (const name of names) tally.manifests.add(name);
    modules.set(folder, tally);
  }
  const deepestFirst = [...modules].sort((a, b) => b[0].length - a[0].length);
  notModules.sort((a, b) => byCodeUnit(a.path, b.path));
  return { manifests, modules: new Map(deepestFirst), notModules };
}

interface Owners {
  readonly manifests: ReadonlySet<string>;
  readonly modules: Map<string, Tally>;
  readonly deployment: Tally;
  readonly deploymentPaths: Set<string>;
}

/** Where a path belongs: `deployment`, a module folder, or nowhere. */
function ownerOf(path: string, owners: Owners): Tally | undefined {
  const root = deploymentRootOf(path, owners.manifests);
  if (root !== undefined) {
    owners.deploymentPaths.add(root);
    return owners.deployment;
  }
  for (const [folder, tally] of owners.modules) if (within(path, folder)) return tally;
  return undefined;
}

function countFiles(files: readonly FileEntry[], owners: Owners): void {
  for (const file of files) {
    const tally = ownerOf(file.path, owners);
    if (tally === undefined) continue;
    tally.files += 1;
    if (file.skipped !== undefined || file.language === 'unknown') continue;
    tally.lines.set(file.language, (tally.lines.get(file.language) ?? 0) + file.lines);
  }
}

/** A card is a module's own when its Supported claims cite files of that module and of no other. */
function countCards(cards: readonly SourceCard[], owners: Owners): void {
  for (const card of cards) {
    const cited = card.claims
      .filter((claim) => claim.status === 'Supported')
      .flatMap((claim) => claim.citations.map((citation) => citation.path));
    const found = new Set(cited.flatMap((path) => ownerOf(path, owners) ?? []));
    const [only] = found;
    if (found.size === 1 && only !== undefined) only.cards.add(card.id);
  }
}

function languagesOf(tally: Tally): string[] {
  return [...tally.lines]
    .sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))
    .slice(0, MAX_LANGUAGES)
    .map(([language]) => language);
}

function moduleOf(path: string, tally: Tally): SourceModule {
  return {
    path,
    manifests: [...tally.manifests].sort(byCodeUnit),
    languages: languagesOf(tally),
    files: tally.files,
    cards: [...tally.cards].sort(byCodeUnit),
  };
}

function deploymentOf(owners: Owners): DeploymentMaterial | undefined {
  const { deployment, deploymentPaths } = owners;
  if (deployment.files === 0) return undefined;
  const paths = [...deploymentPaths].sort(byCodeUnit);
  // A folder already listed holds the files below it.
  const tops = paths.filter(
    (path) => !paths.some((other) => within(path, other) && other !== path),
  );
  return {
    paths: tops.slice(0, MAX_DEPLOYMENT_PATHS),
    files: deployment.files,
    cards: [...deployment.cards].sort(byCodeUnit),
  };
}

/** The modules and the deployment material of a scan, with the source cards that cite them. */
// P8-06, RF-601
export function sourceModules(
  files: readonly FileEntry[],
  cards: readonly SourceCard[],
): SourceModules {
  const folders = moduleFolders(files);
  const owners: Owners = {
    ...{ manifests: folders.manifests, modules: folders.modules },
    deployment: newTally(),
    deploymentPaths: new Set(),
  };
  countFiles(files, owners);
  countCards(cards, owners);
  const all = [...owners.modules].map(([path, tally]) => moduleOf(path, tally));
  const largest = [...all].sort((a, b) => b.files - a.files || byCodeUnit(a.path, b.path));
  const sent = new Set(largest.slice(0, MAX_MODULES).map((each) => each.path));
  const byPath = (a: SourceModule, b: SourceModule): number => byCodeUnit(a.path, b.path);
  const deployment = deploymentOf(owners);
  return {
    modules: all.filter((each) => sent.has(each.path)).sort(byPath),
    overCap: all.filter((each) => !sent.has(each.path)).sort(byPath),
    ...(deployment === undefined ? {} : { deployment }),
    notModules: folders.notModules,
    ciFiles: files
      .map((each) => each.path)
      .filter(isCiFile)
      .sort(byCodeUnit)
      .slice(0, MAX_DEPLOYMENT_PATHS),
  };
}
