import type { Verdict } from './verdict-answer.js';

// RF-301, DEC-19, P3-124, HB-05: a `Rejected` verdict whose one-line reason clearly says that the
// cited lines match, agree with, show or support the claim contradicts itself. The check is
// deliberately narrow: it fires only on those positive phrases and never when the reason also holds
// a negation, a shortfall or a limit ("fail to support", "nothing supports", "insufficient",
// "only partly", "outside"), so a real rejection is never questioned.

const agrees =
  /\b(?:match(?:es|ing)?|consistent with|agrees? with|supports?|supporting|confirms?|confirming|shows?|showing)\s+(?:the|this)\s+claim\b|\bas the claim (?:says|states)\b/iu;
const hedges =
  /\b(?:not|no|never|neither|nor|none|nothing|cannot|can't|fails?|failed|failing|insufficient|unable|short|vague|too|little|only|partly|partial|beyond|outside|unless|missing|lacks?|lacking|absent|without|but|however|although|though|yet|except|contradicts?|differs?|instead|rather)\b|n't/iu;

/** What to tell the verifier when its reason and its verdict disagree, or undefined when they do not. */
export function contradictionProblem(verdict: Verdict): string | undefined {
  if (verdict.status !== 'Rejected') return undefined;
  if (!agrees.test(verdict.reason) || hedges.test(verdict.reason)) return undefined;
  return 'your reason and your verdict point different ways: the reason reads as if the cited lines show the claim, yet the verdict is Rejected. Re-read the lines and answer with the verdict your reason supports, whichever way that is.';
}
