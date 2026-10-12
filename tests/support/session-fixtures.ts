/**
 * RF-1101: predictable session ids of the real form (43 base64url characters), for unit tests that
 * must use no randomness: `sess-1xxxx...`, `sess-2xxxx...`, and so on.
 */
export function sequenceSessionIds(): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `sess-${String(count)}-`.padEnd(43, 'x');
  };
}
