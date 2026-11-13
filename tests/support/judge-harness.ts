// RF-1404, RF-1405: the judge's reply as the fake model writes it.

/** A reply that gives every listed criterion the score of `scores` (or `fallback`). */
export function judgeReply(
  ids: readonly string[],
  scores: Readonly<Record<string, number>> = {},
  fallback = 4,
): string {
  const list = ids.map((id) => ({
    criterion: id,
    score: scores[id] ?? fallback,
    reason: `Reason for ${id}.`,
  }));
  return JSON.stringify({ scores: list });
}

export const VERIFIER_IDS = ['grounding', 'verdict-correct', 'reason-quality', 'form'] as const;
