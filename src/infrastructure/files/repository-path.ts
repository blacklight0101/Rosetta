import { isAbsolute, relative } from 'node:path';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-140, ADR-013: a path that comes from a request (an agent tool call, a setting) is untrusted.
// It must be a plain relative path with forward slashes; anything that could reach outside the
// root on any operating system is refused before the file system is touched.

export type PathProblem = 'outside-root' | 'invalid-path';

// Windows device names, with or without an extension, in any case (COM¹..³ and LPT¹..³ included).
const deviceName = /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[0-9¹²³])$/i;
// Characters Windows refuses in a name, the stream separator `:` and every control character.
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const forbiddenCharacter = /[<>:"|?*\u0000-\u001F\u007F]/;
const driveLetter = /^[a-z]:/i;

function hasTraversal(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('\\') || driveLetter.test(path)) return true;
  return path.split(/[/\\]/).includes('..');
}

function isInvalidSegment(segment: string): boolean {
  if (segment === '' || segment === '.') return true;
  if (segment.endsWith('.') || segment.endsWith(' ')) return true;
  const stem = segment.split('.')[0] ?? '';
  return deviceName.test(stem.trimEnd());
}

function problemOf(path: string): PathProblem | undefined {
  if (hasTraversal(path)) return 'outside-root';
  if (path.includes('\\') || forbiddenCharacter.test(path)) return 'invalid-path';
  return path.split('/').some(isInvalidSegment) ? 'invalid-path' : undefined;
}

/**
 * Checks an untrusted repository-relative path. The compatibility form (NFKC) is checked too, so
 * full-width dots or slashes cannot stand in for `..` or `/` on a system that folds them.
 */
export function checkRepositoryPath(path: string): Result<string, PathProblem> {
  const problem = problemOf(path) ?? problemOf(path.normalize('NFKC'));
  return problem === undefined ? ok(path) : err(problem);
}

/** Whether the platform path `path` is `root` or lies below it. */
export function isInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
}
