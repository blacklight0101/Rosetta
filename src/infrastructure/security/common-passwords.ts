import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-1103, ADR-015: the list of the 10,000 most common passwords, read once at start-up. Lines that
// start with `#` (the source and licence header) and empty lines are not entries; entries are kept
// in lower case, as the password rules expect.

/**
 * The shipped list. This module is at the same depth in `src/` and in the built `dist/`, so
 * `../../../` is the repository root (the image's app folder) from both.
 */
export const commonPasswordsFile = fileURLToPath(
  new URL('../../../src/infrastructure/security/common-passwords.txt', import.meta.url),
);

/** The entries of the list in lower case; RST-2501 when the file cannot be read. */
// RF-1103
export async function loadCommonPasswords(path: string): Promise<ReadonlySet<string>> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new RosettaError(ERROR_CODES.commonPasswordsUnreadable, undefined, { cause: error });
  }
  const entries = text
    .split(/\r?\n/)
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.toLowerCase());
  return new Set(entries);
}
