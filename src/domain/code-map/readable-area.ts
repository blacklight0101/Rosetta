import type { Area } from './area.js';
import type { FileEntry } from './file-entry.js';
import { isThirdPartyFile } from './third-party.js';

// P8-14, P7-02, DEC-194: an area a reader (or a Deepen) can read holds a first-party file with at
// least one token. An area with no token is nothing to read, so it is never counted as unread.

/** True when the area has a first-party file with tokens to read. */
export function hasReadableFile(
  area: Pick<Area, 'files'>,
  files: ReadonlyMap<string, FileEntry>,
): boolean {
  return area.files.some((path) => {
    const file = files.get(path);
    return file !== undefined && file.estimatedTokens > 0 && !isThirdPartyFile(file);
  });
}
