// RF-1405, DEC-231, ADR-029 (amendment P10 lab fixes): which cases of a set are held back from
// tuning. The side of a case is decided by its input alone: the SHA-256 of the canonical JSON of the
// input (keys sorted at every level, no case id, no prompt id). The distinct inputs of a set are
// ordered by that hash and the first `ceil(m / 3)` of the `m` distinct inputs are held back, so a
// twin (the same input under another case id) always falls on the side of the first, and the sets
// of other prompts over the same inputs agree. A repair case takes the side of the case it was built
// on. The rule still reads no answer and no version of a prompt, so the split exists before any
// version is tried. The tests recompute it for every committed set.

/** SHA-256 of a text as hexadecimal; the infrastructure supplies it. */
export type Sha256 = (text: string) => string;

type Split = 'tune' | 'held-back';

/** Code-unit order, the same on every machine (no locale). */
function byCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** The JSON of a value with the keys of every object sorted, so equal inputs have one text. */
// RF-1405
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => byCodeUnits(a, b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

/** The key of an input: the SHA-256 of its canonical JSON. */
// RF-1405
export function inputKey(input: unknown, sha256: Sha256): string {
  return sha256(canonicalJson(input));
}

/** The side of each input, in the order given: a third of the distinct inputs, rounded up, held back. */
// RF-1405
export function splitsOf(inputs: readonly unknown[], sha256: Sha256): Split[] {
  const keys = inputs.map((input) => inputKey(input, sha256));
  const distinct = [...new Set(keys)].sort();
  const held = new Set(distinct.slice(0, Math.ceil(distinct.length / 3)));
  return keys.map((key) => (held.has(key) ? 'held-back' : 'tune'));
}

/** Not built yet (red). */
export function heldBackKey(key: string): boolean {
  return key === '';
}
