// RF-202, RF-208: one problem found in an agent's answer, as the repair request and the invalid
// output list it. `path` is dotted (`cards.0.claims.1.citations`), empty for the answer as a whole.

export interface OutputProblem {
  readonly path: string;
  readonly message: string;
}
