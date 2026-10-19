import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-129: the refusals of the zip extractor. The message is for the log; the page shows the
// catalogue text of the code (RF-007). Entry names come from the archive, so they are quoted and cut.

const NAME_LIMIT = 120;

function quoted(name: string): string {
  return JSON.stringify(name.length > NAME_LIMIT ? `${name.slice(0, NAME_LIMIT)}...` : name);
}

/** RST-1909: not a zip, damaged, or headers that disagree with the content. */
export function zipNotReadable(detail: string, cause?: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.zipNotReadable, `The zip could not be read: ${detail}.`, {
    cause,
  });
}

/** RST-1910: the unpacked size passes the limit, by the central directory or while writing. */
export function zipTooLarge(limit: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.zipTooLarge,
    `The zip holds more than ${String(limit)} bytes once unpacked.`,
  );
}

/** RST-1911: more entries than the limit. */
export function zipTooManyEntries(limit: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.zipTooManyEntries,
    `The zip holds more than ${String(limit)} entries.`,
  );
}

/** RST-1912: an entry compresses beyond the ratio limit. */
export function zipRatioTooHigh(name: string, ratio: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.zipRatioTooHigh,
    `The zip entry ${quoted(name)} is compressed more than ${String(ratio)} to 1.`,
  );
}

/** RST-1912, for the whole archive: it unpacks to far more than it takes (DEC-151). */
export function zipArchiveRatioTooHigh(ratio: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.zipRatioTooHigh,
    `The zip is compressed more than ${String(ratio)} to 1 overall.`,
  );
}

/** RST-1913: an entry path that would land outside the destination. */
export function zipEntryPathUnsafe(name: string): RosettaError {
  return new RosettaError(
    ERROR_CODES.zipEntryPathUnsafe,
    `The zip entry ${quoted(name)} would land outside the snapshot folder.`,
  );
}

/** RST-1914: an encrypted entry, or a compression method other than stored and deflate. */
export function zipEntryUnsupported(name: string, reason: string): RosettaError {
  return new RosettaError(
    ERROR_CODES.zipEntryUnsupported,
    `The zip entry ${quoted(name)} ${reason}.`,
  );
}

/** RST-1915: nothing is left to analyse. */
export function zipEmpty(): RosettaError {
  return new RosettaError(ERROR_CODES.zipEmpty);
}
