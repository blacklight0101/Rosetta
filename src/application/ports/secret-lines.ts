// P5-34, RF-141: which lines of a text the masker would replace a secret on. The verifier uses it to
// know a cited line holds a value Rosetta masks, and the plan to list the files that hold one. It
// answers with line numbers only, never with the value.

export interface SecretLines {
  /** The numbers, from 1 and in order, of the lines of the text that hold a secret. */
  of(text: string): readonly number[];
}
