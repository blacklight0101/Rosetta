// ADR-013, RF-202: model output is untrusted input, so every size it can reach is bounded before
// or while it is parsed.

export const cardLimits = {
  /** Characters of the raw answer that are looked at at all. */
  maxOutputChars: 1_000_000,
  maxCards: 100,
  maxClaims: 50,
  maxCitations: 20,
  maxAreaChars: 200,
  maxTitleChars: 200,
  maxSummaryChars: 2000,
  maxClaimChars: 2000,
  maxQuestionChars: 1000,
  maxPathChars: 1024,
  /** Validation problems reported back to the model and the user. */
  maxProblems: 20,
  maxProblemChars: 300,
  /** JSON texts tried per answer, so a crafted answer cannot make the search quadratic. */
  maxJsonCandidates: 8,
} as const;
