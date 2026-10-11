import type { FileEntry } from '../../src/domain/code-map/file-entry.js';

/** A file entry with the given path and token count; `extra` overrides any field. */
export function entry(path: string, tokens = 10, extra: Partial<FileEntry> = {}): FileEntry {
  return {
    path,
    language: 'x',
    lines: tokens,
    estimatedTokens: tokens,
    sha256: 'a'.repeat(64),
    artefactKinds: [],
    mapLevel: 'coarse',
    ...extra,
  };
}

export const underFolder =
  (folder: string) =>
  (path: string): boolean =>
    path.startsWith(`${folder}/`);
