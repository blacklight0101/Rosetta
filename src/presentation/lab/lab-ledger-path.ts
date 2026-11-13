import { isAbsolute } from 'node:path';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-1402, ADR-029: `ROSETTA_LAB_LEDGER`, an optional absolute path of the ledger file. When it is
// set every lab command uses that file instead of `lab-out/ledger.jsonl`, so the phase total does not
// depend on the checkout that runs the lab. A value that is not an absolute `.jsonl` path is refused.

const LEDGER_VARIABLE = 'ROSETTA_LAB_LEDGER';

// RF-1402
export function ledgerFileFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): Result<string | undefined, string> {
  const value = env[LEDGER_VARIABLE];
  if (value === undefined || value === '') return ok(undefined);
  const code = ERROR_CODES.configurationInvalid;
  if (!isAbsolute(value)) {
    return err(`${code}: ${LEDGER_VARIABLE} must be an absolute path of a .jsonl file.`);
  }
  if (!value.endsWith('.jsonl')) {
    return err(`${code}: ${LEDGER_VARIABLE} must name a .jsonl file.`);
  }
  return ok(value);
}

/**
 * RF-1402, DEC-231: the $50 is one maximum for all builders together, so a model whose provider kind is not
 * `fake` (the tests) needs the shared ledger. The message when it has none, else undefined.
 */
export function sharedLedgerProblem(
  kind: string | undefined,
  ledgerFile: string | undefined,
): string | undefined {
  if (kind === 'fake' || ledgerFile !== undefined) return undefined;
  return `${ERROR_CODES.configurationInvalid}: set ${LEDGER_VARIABLE} to the shared Phase 10 ledger (an absolute .jsonl path). The $50 total and the $40 stop line cover all builders together, so a real call must use the one ledger they share.`;
}
