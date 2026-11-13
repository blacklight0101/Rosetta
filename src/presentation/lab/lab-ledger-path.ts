import { isAbsolute } from 'node:path';
import { reservationLifetimeMs } from '../../infrastructure/providers/reservation-lifetime.js';
import { HOLD_TTL_MS } from '../../application/lab/spend-ledger.js';
import type { ProviderKind } from '../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-1402, ADR-029: `ROSETTA_LAB_LEDGER`, the absolute path of the shared ledger file. It is required
// for every real provider: the lab refuses to start a real model without it (see `sharedLedgerProblem`);
// only the fake provider of the tests may leave it unset and use `lab-out/ledger.jsonl` of the checkout.
// When it is set every lab command uses that file, so the phase total does not depend on the checkout
// that runs the lab. A value that is not an absolute `.jsonl` path is refused.

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
 * RF-1402: a hold must outlive the longest call the provider settings allow, counted as the budget
 * guard counts the lifetime of its own reservation (every attempt's timeout, the longest wait
 * between attempts, Ollama's extra requests and a margin). The message when one could outlive it.
 */
export function holdLifetimeProblem(
  provider: string,
  settings:
    | {
        readonly kind: ProviderKind;
        readonly timeoutSeconds: number;
        readonly maxRetries: number;
      }
    | undefined,
): string | undefined {
  if (settings === undefined) return undefined;
  const longest = reservationLifetimeMs(settings);
  if (longest <= HOLD_TTL_MS) return undefined;
  const minutes = String(HOLD_TTL_MS / 60_000);
  return `${ERROR_CODES.configurationInvalid}: the provider ${provider} may keep one call for up to ${String(Math.ceil(longest / 60_000))} minutes (timeout ${String(settings.timeoutSeconds)} s, ${String(settings.maxRetries)} retries, the waits between them and a margin), longer than the ${minutes} minutes the ledger holds a call. Lower timeoutSeconds or maxRetries in the settings.`;
}
