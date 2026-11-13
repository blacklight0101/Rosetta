// RF-1405, DEC-231, ADR-029 (amendment of the P10 lab fixes): which cases of a set are held back
// from tuning. The side of a case is a function of its input alone: the SHA-256 of the canonical
// JSON of the input (keys sorted at every level, no case id, no prompt id), read as a number, held
// back when it falls in the lowest third of the hash space. No other input of the set is read, so a
// twin, a repair case built on the input and the same input in the set of any other prompt fall on
// the same side, whatever else each set holds. A set gets about a third held back, not exactly: a
// small set may have no held-back case or no tune case, which the capture reports. The rule still
// reads no answer and no version of a prompt, so the split exists before any version is tried.
// The tests recompute it for every committed set.

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

/** The space of a SHA-256 hash: 2^256. */
const SPACE = 1n << 256n;

/** Whether an input key (64 hexadecimal digits) is held back: its value is below a third of the space. */
// RF-1405
export function heldBackKey(key: string): boolean {
  return /^[0-9a-fA-F]{64}$/u.test(key) && BigInt(`0x${key}`) * 3n < SPACE;
}

/** The side of each input, in the order given. */
// RF-1405
export function splitsOf(inputs: readonly unknown[], sha256: Sha256): Split[] {
  return inputs.map((input) => (heldBackKey(inputKey(input, sha256)) ? 'held-back' : 'tune'));
}
