// RF-1405, DEC-231: which cases of a set are held back from tuning. The rule is fixed here and reads
// no input: the first `ceil(n / 3)` cases in the order of the SHA-256 of `<prompt id>:<case id>`. The
// split therefore exists the moment the ids exist, before any prompt version is tried, and the same
// ids always give the same split. The tests recompute it for every committed set.

/** SHA-256 of a text as hexadecimal; the infrastructure supplies it. */
export type Sha256 = (text: string) => string;

// RF-1405
export function heldBackIds(
  promptId: string,
  ids: readonly string[],
  sha256: Sha256,
): ReadonlySet<string> {
  const rank = (id: string): string => sha256(`${promptId}:${id}`);
  const ordered = [...ids].sort((a, b) => rank(a).localeCompare(rank(b)));
  return new Set(ordered.slice(0, Math.ceil(ids.length / 3)));
}

/** Not built yet (red). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

/** Not built yet (red). */
export function inputKey(input: unknown, sha256: Sha256): string {
  return sha256(canonicalJson(input));
}

/** Not built yet (red). */
export function splitsOf(inputs: readonly unknown[], sha256: Sha256): ('tune' | 'held-back')[] {
  return inputs.map((input) => (inputKey(input, sha256) === '' ? 'held-back' : 'tune'));
}
