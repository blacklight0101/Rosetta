import type { Verdict } from './verdict-answer.js';

// RF-301, DEC-19, P3-124, HB-05: a `Rejected` verdict whose one-line reason says that the cited
// lines match, agree with or support the claim contradicts itself. The check is deliberately
// narrow: it fires only on those phrases and never when the reason also holds a negation, a
// contrast or a limit ("does not match", "but", "only"), so a real rejection is never questioned.

const agrees =
  /\b(?:match(?:es|ing)?|consistent with|agrees? with|supports?|supporting|confirms?|confirming)\s+(?:the|this)\s+claim\b|\bas the claim (?:says|states)\b/iu;
const hedges =
  /\b(?:not|no|never|neither|nor|none|cannot|can't|doesn't|don't|isn't|but|however|although|though|yet|except|only|unless|missing|lacks?|absent|without|contradicts?|differs?|instead|rather)\b|n't/iu;

/** What to tell the verifier when its reason and its verdict disagree, or undefined when they do not. */
export function contradictionProblem(verdict: Verdict): string | undefined {
  if (verdict.status !== 'Rejected') return undefined;
  if (!agrees.test(verdict.reason) || hedges.test(verdict.reason)) return undefined;
  return 'your reason says the cited lines agree with the claim, but your verdict is Rejected; make the reason and the verdict agree.';
}
