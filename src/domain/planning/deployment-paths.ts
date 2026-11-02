// P8-06, RF-601, EV-32: which paths of the scan are legacy deployment material, read from the path
// alone and matched by exact, anchored names, never by a substring. A folder is deployment material
// when a whole word of its name (split at `-`, `_`, `.` and spaces) is `kubernetes`, `k8s`, `helm` or
// `servicefabric`, or its name is `deploy`, `deployment` or `deployments` outside a module; inside such
// a folder only configuration and script files count (`Models/Deployment/Plan.cs` is code). A file
// is deployment material by its exact name: a Dockerfile, a compose file, a publish profile, a
// Docker or Service Fabric project. A folder that holds a project or package manifest is a module,
// never deployment (`Foo.ServiceFabric/Foo.csproj`). Nothing under `docs`, `doc`, `test` or
// `tests` at the root counts. A CI file is not deployment by its path, since it may only run tests:
// it is listed apart (ciFileOf) so checks.md can name it. The names are a table, like the artefact
// rules of the scan, so a new platform adds a name and no code. A Helm chart is found by its
// `Chart.yaml`, whatever its folder is called: that folder and everything under it ships.

const folderWords: ReadonlySet<string> = new Set(['kubernetes', 'k8s', 'helm', 'servicefabric']);

/** Folder names that are deployment material only when they lie in no module. */
const outsideModuleNames: ReadonlySet<string> = new Set(['deploy', 'deployment', 'deployments']);

const skippedRoots: ReadonlySet<string> = new Set([
  'docs',
  'doc',
  'documentation',
  'test',
  'tests',
]);

/** The file kinds that count inside a deployment folder: configuration, manifests and scripts. */
const folderFileExtensions: ReadonlySet<string> = new Set([
  ...['yml', 'yaml', 'json', 'xml', 'ps1', 'psm1', 'sh', 'cmd', 'bat', 'tf', 'tfvars', 'bicep'],
  ...['toml', 'ini', 'cfg', 'conf', 'env', 'config', 'template', 'tpl', 'sfproj', 'dcproj'],
]);

const fileExtensions: ReadonlySet<string> = new Set(['pubxml', 'dcproj', 'sfproj']);

const exactFileNames: ReadonlySet<string> = new Set([
  'dockerfile',
  'compose.yml',
  'compose.yaml',
  'procfile',
]);

const composeName = /^docker-compose(?:\.[a-z0-9-]+)*\.ya?ml$/u;
/** `Dockerfile.windows`, `web.dockerfile`; not `Dockerfile.cs`. */
const dockerfileName = /^(?:dockerfile\.(?:[a-z0-9-]+)|[a-z0-9.-]+\.dockerfile)$/u;
const codeExtensions: ReadonlySet<string> = new Set([
  ...['cs', 'vb', 'fs', 'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'py', 'java', 'kt', 'go', 'rb'],
  ...['php', 'rs'],
]);
const sourceExtensions: ReadonlySet<string> = new Set([
  ...codeExtensions,
  ...['md', 'txt', 'html', 'css'],
]);

/** Folder names that hint at deployment, used only to name a file that counts nowhere. */
const hintFolders: ReadonlySet<string> = new Set([
  ...['infra', 'infrastructure', 'terraform', 'ops', 'devops', 'docker', 'arm', 'charts'],
  ...['deploy', 'deployment', 'deployments', 'k8s', 'kube', 'kubernetes', 'helm', 'manifests'],
]);
const hintExtensions: ReadonlySet<string> = new Set(['tf', 'tfvars', 'bicep']);

const ciFileNames: ReadonlySet<string> = new Set([
  'azure-pipelines.yml',
  'azure-pipelines.yaml',
  'bitbucket-pipelines.yml',
  '.gitlab-ci.yml',
  '.travis.yml',
  'appveyor.yml',
  'jenkinsfile',
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1) : '';
}

function isDeploymentFile(name: string): boolean {
  if (exactFileNames.has(name) || composeName.test(name)) return true;
  if (dockerfileName.test(name)) return !sourceExtensions.has(extensionOf(name));
  return fileExtensions.has(extensionOf(name));
}

function isDeploymentFolder(segment: string, insideModule: boolean): boolean {
  const name = segment.toLowerCase();
  if (name.split(/[-_.\s]+/u).some((word) => folderWords.has(word))) return true;
  return !insideModule && outsideModuleNames.has(name);
}

/** True for a path under `docs` or `tests` at the root, where nothing is deployment. */
function underSkippedRoot(segments: readonly string[]): boolean {
  return segments.length > 1 && skippedRoots.has((segments[0] ?? '').toLowerCase());
}

/** The first folder of the path that is deployment material, skipping module folders. */
function deploymentFolderOf(
  segments: readonly string[],
  modules: ReadonlySet<string>,
): string | undefined {
  let insideModule = modules.has('.');
  for (let at = 0; at < segments.length - 1; at += 1) {
    const folder = segments.slice(0, at + 1).join('/');
    if (modules.has(folder)) insideModule = true;
    else if (isDeploymentFolder(segments[at] ?? '', insideModule)) return folder;
  }
  return undefined;
}

/** The shortest Helm chart folder (it holds `Chart.yaml`) that holds the path: all of it ships. */
function chartRootOf(segments: readonly string[], charts: ReadonlySet<string>): string | undefined {
  for (let at = 1; at < segments.length; at += 1) {
    const folder = segments.slice(0, at).join('/');
    if (charts.has(folder)) return folder;
  }
  return undefined;
}

/** The folder of a Helm chart when the path is its `Chart.yaml`. */
// P8-06, RF-601
export function chartFolderOf(path: string): string | undefined {
  const at = path.lastIndexOf('/');
  const name = path.slice(at + 1).toLowerCase();
  return name === 'chart.yaml' && at > 0 ? path.slice(0, at) : undefined;
}

/** True for a code file (`.cs`, `.js`, `.py`, ...), which a deployment folder does not hold. */
// P8-06, RF-601
export function isCodeFile(path: string): boolean {
  return codeExtensions.has(extensionOf(path.slice(path.lastIndexOf('/') + 1).toLowerCase()));
}

/**
 * P8-06: a file that looks like deployment (Terraform or Bicep, a Helm values file, a YAML or script
 * file in an `infra`, `docker`, `charts` or `deploy` folder) but is counted nowhere: checks.md
 * names it so nothing deployment-like is lost in silence.
 */
// P8-06, RF-601
export function looksDeploymentLike(path: string): boolean {
  const segments = path.toLowerCase().split('/');
  const name = segments.at(-1) ?? '';
  if (hintExtensions.has(extensionOf(name)) || name === 'values.yaml') return true;
  if (name.includes('docker') && !sourceExtensions.has(extensionOf(name))) return true;
  const hinted = segments.slice(0, -1).some((segment) => hintFolders.has(segment));
  return hinted && folderFileExtensions.has(extensionOf(name));
}

/**
 * The shortest folder of the path that is deployment material, or the path itself when only its
 * file name is; undefined for any other path. `modules` holds the folders with a manifest: such a
 * folder is never deployment, and a `deploy` folder inside one is not either.
 */
// P8-06, RF-601
export function deploymentRootOf(
  path: string,
  modules: ReadonlySet<string> = new Set(),
  charts: ReadonlySet<string> = new Set(),
): string | undefined {
  const segments = path.split('/').filter((segment) => segment !== '');
  if (underSkippedRoot(segments)) return undefined;
  const chart = chartRootOf(segments, charts);
  if (chart !== undefined) return chart;
  const name = (segments.at(-1) ?? '').toLowerCase();
  const folder = deploymentFolderOf(segments, modules);
  if (folder !== undefined) {
    const counts = isDeploymentFile(name) || folderFileExtensions.has(extensionOf(name));
    return counts ? folder : undefined;
  }
  return isDeploymentFile(name) ? segments.join('/') : undefined;
}

/** The path when it is a CI file, which may only build and test, so it is named and not counted. */
// P8-06, RF-601
export function isCiFile(path: string): boolean {
  const lower = path.toLowerCase();
  const name = lower.slice(lower.lastIndexOf('/') + 1);
  if (ciFileNames.has(name)) return true;
  return /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/u.test(lower);
}
