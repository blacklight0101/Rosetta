import type { Claim } from '../../domain/cards/card.js';

// EV-78, RF-301, P8-14: a claim stands on its own. A claim of an earlier draft, rejected or not, is not
// evidence, so a claim that says the earlier claim was wrong, or that names a claim by its id, says
// nothing about the code. The check is free and needs no model. The words alone also describe a
// claims application ("the first claim of a policy holder"), so a phrase counts only next to a word
// that corrects, replaces or quotes it: a verb or a preposition right before it, a negative judgement
// within eight words after it, or "said"/"stated" right after it. Everything else is left to the verifier.

const earlier = String.raw`(?:earlier|previous|prior|preceding|former|rejected|original|first)\s+(?:claims?|drafts?)`;
const before = new RegExp(
  String.raw`\b(?:unlike|contrary to|corrects?|replaces?|supersedes|retracts?|contradicts?|instead of|in place of|disagrees? with)\s+(?:the\s+|this\s+|that\s+)?${earlier}\b`,
  'iu',
);
const judged = new RegExp(
  String.raw`\b${earlier}(?:\W+\w+){0,8}?\W+(?:wrong|incorrect(?:ly)?|inaccurate(?:ly)?|not accurate|false|mistaken|overstat(?:ed|es)|understat(?:ed|es)|does not hold|did not hold|no longer holds?|(?:is|was) not true)\b`,
  'iu',
);
const quoted = new RegExp(String.raw`\b${earlier}\s+(?:\w+\s+){0,2}(?:said|stated)\b`, 'iu');
const namesClaimId = /\b[A-Z]{2,6}-\d{3,}\.c\d+\b/u;

/** Why the claim is rejected, or undefined when it does not refer to another claim. */
// RF-301
export function earlierClaimReason(claim: Pick<Claim, 'text'>): string | undefined {
  const { text } = claim;
  const refers = before.test(text) || judged.test(text) || quoted.test(text);
  if (!refers && !namesClaimId.test(text)) return undefined;
  return 'The claim refers to an earlier or rejected claim. A claim states what the code does and does not refer to another claim.';
}
