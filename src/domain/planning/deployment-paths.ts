// P8-06, RF-601, EV-32: which paths are deployment material, read from the path alone so one rule
// serves the scan of the legacy code and the files a task card expects to change in the new
// repository. A folder is deployment material when its name says so (`deploy`, `docker`, `k8s`, a
// name holding `kubernetes`, `servicefabric` or `helm`, the CI workflows of `.github/workflows`); a
// file is when its name is one that only builds or ships the system (a Dockerfile, a compose file,
// a CI file, a publish profile). The names are a table, like the artefact rules of the scan, so a
// new platform adds a name and no code.

const folderNames: ReadonlySet<string> = new Set([
  'deploy',
  'deployment',
  'deployments',
  'docker',
  'k8s',
  'kube',
]);

/** A folder whose name holds one of these is deployment material (`Kubernetes-DockerForWindows`). */
const folderParts = ['kubernetes', 'servicefabric', 'helm', '-k8s', 'k8s-'] as const;

const fileNames: ReadonlySet<string> = new Set([
  'dockerfile',
  '.dockerignore',
  'azure-pipelines.yml',
  'bitbucket-pipelines.yml',
  '.gitlab-ci.yml',
  '.travis.yml',
  'appveyor.yml',
  'jenkinsfile',
  'procfile',
]);

const fileExtensions: ReadonlySet<string> = new Set(['pubxml', 'dcproj', 'sfproj']);

function isDeploymentFolder(segment: string): boolean {
  const name = segment.toLowerCase();
  return folderNames.has(name) || folderParts.some((part) => name.includes(part));
}

/** True for a file name that only builds or ships the system. */
function isDeploymentFile(segment: string): boolean {
  const name = segment.toLowerCase();
  if (fileNames.has(name) || name.startsWith('dockerfile.')) return true;
  if (name.startsWith('docker-compose') && /\.ya?ml$/u.test(name)) return true;
  const dot = name.lastIndexOf('.');
  return dot > 0 && fileExtensions.has(name.slice(dot + 1));
}

/**
 * The shortest folder of the path that is deployment material, or the path itself when only its
 * file name is; undefined for any other path. Paths are relative with forward slashes.
 */
// P8-06, RF-601
export function deploymentRootOf(path: string): string | undefined {
  const segments = path.split('/').filter((segment) => segment !== '');
  const workflows = segments.findIndex(
    (segment, at) => segment === '.github' && segments[at + 1] === 'workflows',
  );
  if (workflows >= 0) return segments.slice(0, workflows + 2).join('/');
  const folders = segments.slice(0, -1);
  const at = folders.findIndex(isDeploymentFolder);
  if (at >= 0) return segments.slice(0, at + 1).join('/');
  const last = segments.at(-1);
  if (last !== undefined && isDeploymentFile(last)) return segments.join('/');
  // A path that ends in a deployment folder (`deploy/` in a card's expected files).
  if (last !== undefined && path.endsWith('/') && isDeploymentFolder(last)) {
    return segments.join('/');
  }
  return undefined;
}

/** True when the path is deployment material by its folders or its file name. */
// P8-06, RF-601
export function isDeploymentPath(path: string): boolean {
  return deploymentRootOf(path) !== undefined;
}
