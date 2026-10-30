import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-159, DEC-183: the attach of a source has a time limit. A Cancel that comes while a source is being
// attached waits for the end of the work, so an attach that never answers (a database that hangs) must
// end the batch instead of holding it, and the Cancel, for good.

/** How long the attach may take when the dependencies do not say. */
const ATTACH_TIMEOUT_MS = 60_000;

/**
 * The result of `attach`, or a RosettaError with the time-bound code (RST-1918) when it takes longer
 * than `limitMs`. The attach is not stopped (it cannot be) and may still land: `onLate` is told as the
 * limit passes, so the caller keeps the project busy until the attach settles and corrects the batch
 * from what it did (`late-attach.ts`).
 */
export async function withinAttachLimit<T>(
  attach: Promise<T>,
  limitMs: number = ATTACH_TIMEOUT_MS,
  onLate?: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onLate?.();
      reject(
        new RosettaError(ERROR_CODES.uploadTimedOut, 'The upload took too long to be attached.'),
      );
    }, limitMs);
  });
  // A late failure of the attach must not be left without a handler once the limit has passed.
  attach.catch(() => undefined);
  try {
    return await Promise.race([attach, late]);
  } finally {
    clearTimeout(timer);
  }
}
