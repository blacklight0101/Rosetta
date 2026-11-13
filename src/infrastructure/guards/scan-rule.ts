// RF-141 (P10 masker gaps): a masker rule that finds its secrets by a scan instead of one pattern, for a
// shape a single pattern cannot read linearly (every `-P` of a SQL Server tool's line, P10 masker gaps).

/** Where a secret is in the text: its first index and the index after its end. */
export type SecretSpan = readonly [start: number, end: number];

/** A rule whose secrets are the spans its scan returns, in order and without overlap. */
export interface ScanRule<K extends string = string> {
  readonly kind: K;
  readonly scan: (text: string) => readonly SecretSpan[];
}
