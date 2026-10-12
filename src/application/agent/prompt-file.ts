// RNF-004: a versioned prompt file as a run uses it. The text is what the model reads; the name,
// version and SHA-256 of its bytes go to the run manifest, so a run can be explained and repeated.
export interface PromptFile {
  /** The path under the prompts folder, for example `reader/area.v1.md`. */
  readonly name: string;
  /** `v1` for `area.v1.md`. */
  readonly version: string;
  /** Lower-case hexadecimal SHA-256 of the file's bytes. */
  readonly sha256: string;
  readonly text: string;
}
