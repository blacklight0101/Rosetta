// RF-624, RF-603, ADR-013: the grammar of the names and paths in the API contract. The planner's
// answer is untrusted text, and an operation id or a path ends up as a key of a YAML document and a
// name in the README, so each is an allowlisted shape: an identifier, and a path of plain lower-case
// segments or `{name}` parameters. Nothing else is repaired or guessed; it is refused.

const operationId = /^[A-Za-z][A-Za-z0-9_]{0,62}$/u;
const plainSegment = /^[a-z0-9][a-z0-9._-]{0,40}$/u;
const parameterSegment = /^\{([A-Za-z_][A-Za-z0-9_]{0,40})\}$/u;
const MAX_PATH = 200;

// RF-624
export function isOperationId(name: string): boolean {
  return operationId.test(name);
}

/** The names of the `{parameters}` of a path, in order; empty for a path that is not valid. */
// RF-624
export function pathParameters(path: string): string[] {
  return path.split('/').flatMap((segment) => parameterSegment.exec(segment)?.[1] ?? []);
}

/** Whether the path is `/` or plain segments and `{parameters}` with no parameter repeated. */
// RF-624
export function isApiPath(path: string): boolean {
  if (path === '/') return true;
  if (path.length > MAX_PATH || !path.startsWith('/')) return false;
  const segments = path.slice(1).split('/');
  const shaped = segments.every(
    (segment) => plainSegment.test(segment) || parameterSegment.test(segment),
  );
  const names = pathParameters(path);
  return shaped && new Set(names).size === names.length;
}

/** The path with every parameter name replaced, so two spellings of one route are equal. */
// RF-624
export function pathSignature(path: string): string {
  return path
    .split('/')
    .map((segment) => (parameterSegment.test(segment) ? '{}' : segment))
    .join('/');
}
