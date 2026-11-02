import type { Claim } from '../../domain/cards/card.js';

// EV-78, RF-301: a claim stands on its own. A claim of an earlier draft, rejected or not, is not
// evidence, so a claim that says the earlier claim was wrong, or that names a claim by its id, says
// nothing about the code. The check is free and needs no model.

const namesEarlierClaim =
  /\b(?:earlier|previous|prior|preceding|former|rejected|original|first)\s+(?:claims?|drafts?)\b/iu;
// P8-14, P7-22: the words alone also describe a claims application ("the first claim of a policy holder",
// "a rejected claim is returned"), so a phrase counts only next to a word that corrects, replaces or
// quotes a claim; a claim id needs no such word.
const correction =
  /\b(?:wrong|incorrect|false|mistaken|correct(?:s|ed|ion)?|replaces?|replaced|instead|unlike|contrary|contradicts?|supersed(?:es|ed)|retract(?:s|ed)?|said|stated)\b/iu;
const namesClaimId = /\b[A-Z]{2,6}-\d{3,}\.c\d+\b/u;

/** Why the claim is rejected, or undefined when it does not refer to another claim. */
// RF-301
export function earlierClaimReason(claim: Pick<Claim, 'text'>): string | undefined {
  const { text } = claim;
  const refers = namesEarlierClaim.test(text) && correction.test(text);
  if (!refers && !namesClaimId.test(text)) return undefined;
  return 'The claim refers to an earlier or rejected claim. A claim states what the code does and does not refer to another claim.';
}
