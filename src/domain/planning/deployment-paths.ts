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
// rules of the scan, so a new platform adds a name and no code.

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
const sourceExtensions: ReadonlySet<string> = new Set([
  ...['cs', 'vb', 'fs', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'kt', 'go', 'rb', 'php', 'rs'],
  ...['md', 'txt', 'html', 'css'],
]);

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
  // P8-06 skeleton: the chart folders are not used yet.
  if (charts.has(path)) return undefined;
  const segments = path.split('/').filter((segment) => segment !== '');
  if (underSkippedRoot(segments)) return undefined;
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

/** P8-06 skeleton: the folder of a Helm chart; the rule comes with the fix. */
// P8-06, RF-601
export function chartFolderOf(path: string): string | undefined {
  return path.length < 0 ? path : undefined;
}
