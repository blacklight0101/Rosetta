/* eslint-disable @typescript-eslint/no-unused-vars -- red skeleton, replaced by the feat commit */
import type { Result } from '../../domain/errors/result.js';

// RF-1402, ADR-029: the optional shared ledger file of `ROSETTA_LAB_LEDGER`.

export function ledgerFileFromEnvironment(
  _env: Readonly<Record<string, string | undefined>>,
): Result<string | undefined, string> {
  throw new Error('not implemented');
}
