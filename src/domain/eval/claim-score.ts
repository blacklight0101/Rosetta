import { byCodeUnit } from '../code-map/code-unit-order.js';
import { citesAnyPath, hitsAbsence, matchesFinding, type EvaluatedClaim } from './claim-match.js';
import {
  STRUCTURE_KINDS,
  type GoldenAbsence,
  type GoldenCase,
  type GoldenFinding,
} from './golden-set.js';
import { ratio } from './ratio.js';
import { structureScore, type StructureScore } from './structure-score.js';

// RNF-006, RNF-015, RFC-001 section 7: the precision of `Supported` claims and the recall of the
// golden rules for one run. Only `Supported` claims count. A claim that states something the
// golden set says is not in the code is wrong, even when it also matches a finding (it finds
// nothing then); a claim that matches a finding is correct; any other is unmatched. `precision` is
// correct / (correct + wrong); `strictPrecision` is correct / every Supported claim, the lower
// bound that counts every unmatched claim as wrong. Ids are listed in code-unit order.

export interface ClaimScore extends StructureScore {
  readonly supported: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly unmatched: number;
  readonly precision: number | null;
  readonly strictPrecision: number | null;
  readonly rulesTotal: number;
  readonly rulesFound: number;
  /** Recall of the golden business rules (RNF-006). */
  readonly recall: number | null;
  readonly findingsTotal: number;
  readonly findingsFound: number;
  /** Recall of every finding: features, rules and entities (flows, screens and relations have their own). */
  readonly recallAll: number | null;
  readonly foundFindings: readonly string[];
  readonly missedFindings: readonly string[];
  readonly absencesHit: readonly string[];
  readonly incorrectClaims: readonly string[];
  readonly unmatchedClaims: readonly string[];
}

export interface CaseScore extends ClaimScore {
  readonly caseId: string;
}

function sorted(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort(byCodeUnit);
}

interface Sorted {
  readonly correct: EvaluatedClaim[];
  readonly incorrect: EvaluatedClaim[];
  readonly unmatched: EvaluatedClaim[];
  readonly hit: Set<string>;
}

function sortClaims(
  claims: readonly EvaluatedClaim[],
  findings: readonly GoldenFinding[],
  absences: readonly GoldenAbsence[],
): Sorted {
  const out: Sorted = { correct: [], incorrect: [], unmatched: [], hit: new Set() };
  for (const claim of claims) {
    const hits = absences.filter((absence) => hitsAbsence(claim, absence));
    for (const absence of hits) out.hit.add(absence.id);
    if (hits.length > 0) out.incorrect.push(claim);
    else if (findings.some((finding) => matchesFinding(claim, finding))) out.correct.push(claim);
    else out.unmatched.push(claim);
  }
  return out;
}

// RNF-006
export function scoreClaims(
  claims: readonly EvaluatedClaim[],
  findings: readonly GoldenFinding[],
  absences: readonly GoldenAbsence[],
): ClaimScore {
  const supported = claims.filter((claim) => claim.status === 'Supported');
  const { correct, incorrect, unmatched, hit } = sortClaims(supported, findings, absences);
  const found = findings.filter((finding) =>
    correct.some((claim) => matchesFinding(claim, finding)),
  );
  const rules = findings.filter((finding) => finding.kind === 'rule');
  const rulesFound = found.filter((finding) => finding.kind === 'rule').length;
  const content = findings.filter((finding) => !STRUCTURE_KINDS.some((k) => k === finding.kind));
  const contentFound = found.filter((finding) => content.includes(finding)).length;
  return {
    supported: supported.length,
    correct: correct.length,
    incorrect: incorrect.length,
    unmatched: unmatched.length,
    precision: ratio(correct.length, correct.length + incorrect.length),
    strictPrecision: ratio(correct.length, supported.length),
    rulesTotal: rules.length,
    rulesFound,
    recall: ratio(rulesFound, rules.length),
    findingsTotal: content.length,
    findingsFound: contentFound,
    recallAll: ratio(contentFound, content.length),
    foundFindings: sorted(found.map((finding) => finding.id)),
    missedFindings: sorted(
      findings.filter((finding) => !found.includes(finding)).map((finding) => finding.id),
    ),
    ...structureScore(supported, correct, findings),
    absencesHit: sorted(hit),
    incorrectClaims: sorted(incorrect.map((claim) => claim.claimId)),
    unmatchedClaims: sorted(unmatched.map((claim) => claim.claimId)),
  };
}

/** RNF-006: one case, scored with the claims that cite at least one of its paths. */
export function scoreCase(claims: readonly EvaluatedClaim[], entry: GoldenCase): CaseScore {
  const paths = new Set(entry.paths);
  const own = claims.filter((claim) => citesAnyPath(claim, paths));
  return { caseId: entry.id, ...scoreClaims(own, entry.findings, entry.absences) };
}
