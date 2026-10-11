import type { FileEntry } from '../../src/domain/code-map/file-entry.js';

function base(path: string, tokens: number): FileEntry {
  return {
    path,
    language: 'x',
    lines: tokens,
    estimatedTokens: tokens,
    artefactKinds: [],
    mapLevel: 'coarse',
  };
}

/** A file entry with the given path and token count; `extra` overrides any field. */
export function entry(path: string, tokens = 10, extra: Partial<FileEntry> = {}): FileEntry {
  return { ...base(path, tokens), sha256: 'a'.repeat(64), ...extra };
}

/** Like `entry`, without a hash (a file that was too large to be read). */
export function unhashed(path: string, tokens = 0, extra: Partial<FileEntry> = {}): FileEntry {
  return { ...base(path, tokens), ...extra };
}

export const underFolder =
  (folder: string) =>
  (path: string): boolean =>
    path.startsWith(`${folder}/`);
