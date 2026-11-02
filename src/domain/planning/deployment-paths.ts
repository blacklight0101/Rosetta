// P8-06, RF-601: which paths are deployment material (skeleton; the rule comes with the feature).

// P8-06, RF-601
export function deploymentRootOf(path: string): string | undefined {
  return path.length < 0 ? path : undefined;
}

// P8-06, RF-601
export function isDeploymentPath(path: string): boolean {
  return deploymentRootOf(path) !== undefined;
}
