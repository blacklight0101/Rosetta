import { RosettaError } from '../domain/errors/rosetta-error.js';

// RF-1305, RF-1302: the one line a process of the image prints when it cannot start or finish: the
// RST code, its message and next step, which never hold a configuration value.

/** An uncoded failure's text is not printed (it may hold a detail); the step says where to look. */
const UNCODED: Readonly<Record<string, string>> = {
  migrate: 'The migrate step failed; see the log line above.',
};

/** The failure line of `main.ts` (logger `start-up`) or `migrate.ts` (logger `migrate`). */
export function startFailure(error: unknown, logger: string): string {
  const detail =
    error instanceof RosettaError
      ? { code: error.code, message: error.message, nextStep: error.nextStep }
      : { message: UNCODED[logger] ?? 'Rosetta could not start; see the application log.' };
  return JSON.stringify({ level: 'error', logger, ...detail });
}
