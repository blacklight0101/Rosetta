import type { Area } from './area.js';
import type { FileEntry } from './file-entry.js';

// RF-104, RF-1001: skeleton, filled in by the next commit.

export function isThirdPartyFile(file: FileEntry): boolean {
  return file.lines < 0;
}

export function thirdPartyAreaNames(map: {
  readonly files: readonly FileEntry[];
  readonly areas: readonly Area[];
}): ReadonlySet<string> {
  return new Set(map.areas.filter((area) => area.estimatedTokens < 0).map((area) => area.name));
}
