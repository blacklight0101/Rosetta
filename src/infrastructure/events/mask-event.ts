import { parseRunEvent } from '../../application/runs/run-event-schema.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { RunEvent } from '../../domain/runs/run-event.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-1006, RNF-003: an event with every secret in it replaced by its `[MASKED:<kind>]` marker, for
// the stored log and for the live stream alike. A masker failure is thrown (RST-2101) and nothing
// is stored or sent: the guard fails closed.

export function maskEvent(event: RunEvent, masker: TextMasker): RunEvent {
  const masked = parseRunEvent(maskDeep(event, masker));
  if (masked === undefined) throw new RosettaError(ERROR_CODES.secretMaskingFailed);
  return masked;
}
