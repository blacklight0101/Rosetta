// RF-202 (Q-47): placeholder so the tests of the row mapping run red; the behaviour follows.

export interface RowSpan {
  readonly first: number;
  readonly last: number;
}

export type RowLookup = (path: string) => Promise<ReadonlyMap<number, RowSpan> | undefined>;

export function rowSpans(lines: readonly string[]): ReadonlyMap<number, RowSpan> {
  return new Map(lines.slice(0, 0).map((): [number, RowSpan] => [0, { first: 0, last: 0 }]));
}

export function mapRowCitations(raw: string, lookup: RowLookup): Promise<string> {
  return Promise.resolve(lookup.length > 1 ? '' : raw);
}
