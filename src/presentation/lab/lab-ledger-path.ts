import { isAbsolute } from 'node:path';
import { HOLD_TTL_MS } from '../../application/lab/spend-ledger.js';
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

/**
 * RF-1402: a hold must outlive the longest call the provider settings allow (its timeout, once per
 * attempt). The message when one could outlive it, else undefined.
 */
export function holdLifetimeProblem(
  provider: string,
  settings: { readonly timeoutSeconds: number; readonly maxRetries: number } | undefined,
): string | undefined {
  if (settings === undefined) return undefined;
  const seconds = settings.timeoutSeconds * (settings.maxRetries + 1);
  if (seconds * 1000 <= HOLD_TTL_MS) return undefined;
  const minutes = String(HOLD_TTL_MS / 60_000);
  return `${ERROR_CODES.configurationInvalid}: the provider ${provider} may keep one call for up to ${String(Math.ceil(seconds / 60))} minutes (timeout ${String(settings.timeoutSeconds)} s, ${String(settings.maxRetries)} retries), longer than the ${minutes} minutes the ledger holds a call. Lower timeoutSeconds or maxRetries in the settings.`;
}
