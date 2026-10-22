import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

/** The work, or RST-2104 once `limitMs` has passed without it settling (P1-96). */
export async function withinTimeLimit(work: Promise<void>, limitMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new RosettaError(ERROR_CODES.runEventLogFailed, 'The budget events did not answer.'));
    }, limitMs);
  });
  try {
    await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}
