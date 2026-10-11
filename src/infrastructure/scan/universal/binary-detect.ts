// RF-100, RF-101: a file is binary when its first bytes hold a zero byte, unless a UTF-16 byte
// order mark says it is text in a wide encoding.

const sampleBytes = 8000;

type WideEncoding = 'utf-16le' | 'utf-16be';

function wideEncodingOf(bytes: Uint8Array): WideEncoding | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return undefined;
}

/** Only the first 8000 bytes are examined, so a huge file costs the same as a small one. */
export function isBinary(bytes: Uint8Array): boolean {
  if (wideEncodingOf(bytes) !== undefined) return false;
  return bytes.subarray(0, sampleBytes).includes(0);
}

/** The text of a file; a byte order mark is dropped and invalid bytes become U+FFFD. */
export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder(wideEncodingOf(bytes) ?? 'utf-8').decode(bytes);
}
