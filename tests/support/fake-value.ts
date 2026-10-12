// FAKE SECRETS ONLY (RNF-003): the harmless piece every fake secret of the fixtures is made of.

/** A fake value of the given length made of "FAKE0" repeated. */
export function fakeValue(length: number): string {
  return 'FAKE0'.repeat(Math.ceil(length / 5)).slice(0, length);
}
