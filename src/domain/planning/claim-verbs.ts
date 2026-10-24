// P5-43, RF-602, RNF-004: the verbs that contradict each other, read from
// `prompts/catalogue/claim-verbs.v<n>.yaml`. The planner may reword a claim; it may not turn one
// verb into its opposite. The families, the documentation files and the topic stop words are data
// of the catalogue, so a change to them changes the catalogue hash and no code names a verb (DEC-11).

/** One way a family of verbs can go; the terms are word stems, lower case. */
interface VerbSide {
  /** Rosetta's own words for this side, shown in checks.md. */
  readonly label: string;
  readonly terms: readonly string[];
}

/** Two or more sides that exclude each other: a statement that holds one and not the other. */
export interface VerbFamily {
  readonly id: string;
  readonly sides: readonly VerbSide[];
}

export interface ClaimVerbs {
  /** The `v<n>` of `claim-verbs.v<n>.yaml`. */
  readonly version: number;
  readonly families: readonly VerbFamily[];
  /** File extensions (no dot) of documentation files. */
  readonly documentExtensions: readonly string[];
  /** File base names (lower case, no extension) of documentation files. */
  readonly documentNames: readonly string[];
  readonly stopWords: readonly string[];
}

/** No family, no documentation file: a catalogue built by hand for a test that does not use the check. */
export const noClaimVerbs: ClaimVerbs = {
  version: 0,
  families: [],
  documentExtensions: [],
  documentNames: [],
  stopWords: [],
};
