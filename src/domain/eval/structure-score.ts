import { byCodeUnit } from '../code-map/code-unit-order.js';
import { matchesFinding, mentionsAny, type EvaluatedClaim } from './claim-match.js';
import type { FindingKind, GoldenFinding } from './golden-set.js';
import { ratio } from './ratio.js';

// RF-260, RF-261, RF-262, RNF-006, RFC-001 section 7: the measures of the flows, screens and data
// model of a run, next to the precision and recall of the rules. Step recall: the golden steps a
// correct FLOW claim found, over the golden steps. Screen field recall: the golden screen fields a
// correct SCRN claim found, over the golden fields (the actions of a screen are listed as found or
// missed but are not in this ratio). Relation precision: an ENT card holds claims, not structured
// relations (data-model.md section 3.12), so a relation stated is a Supported ENT claim that holds
// a relation word below; it is correct when it matches a golden relation, and a relation the code
// does not show is wrong. The comparison is mechanical (claim-match.ts), never a model.

export interface StructureScore {
  readonly stepsTotal: number;
  readonly stepsFound: number;
  /** Recall of the steps of the golden flows. */
  readonly stepRecall: number | null;
  readonly fieldsTotal: number;
  readonly fieldsFound: number;
  /** Recall of the fields of the golden screens. */
  readonly screenFieldRecall: number | null;
  readonly relationsStated: number;
  readonly relationsCorrect: number;
  /** Precision of the relations stated by Supported entity claims. */
  readonly relationPrecision: number | null;
  /** The claims that state a relation, in code-unit order. */
  readonly relationClaims: readonly string[];
}

/** Words that say an entity is tied to another; a word ending in `*` is any word that starts so. */
const RELATION_WORDS = [
  ...['refer*', 'foreign key*', 'belong*', 'relat*', 'link*', 'join*', 'associat*'],
  ...['has many', 'has one', 'one-to-many', 'many-to-one', 'one-to-one', 'many-to-many'],
] as const;

/** The noun "reference type" is not a relation between two entities; the verb is. */
const REFERENCE_TYPE = /\breferences?[- ]typ\w*/giu;

function withoutReferenceTypes(claim: EvaluatedClaim): EvaluatedClaim {
  return {
    ...claim,
    cardTitle: claim.cardTitle.replace(REFERENCE_TYPE, ' '),
    text: claim.text.replace(REFERENCE_TYPE, ' '),
  };
}

function ofKind(findings: readonly GoldenFinding[], kind: FindingKind): GoldenFinding[] {
  return findings.filter((finding) => finding.kind === kind);
}

function found(correct: readonly EvaluatedClaim[], group: readonly GoldenFinding[]): number {
  return group.filter((finding) => correct.some((claim) => matchesFinding(claim, finding))).length;
}

/**
 * RF-260, RF-261, RF-262: `supported` is every Supported claim of the run, `correct` the ones that
 * match a golden finding and state nothing the golden set says is absent.
 */
export function structureScore(
  supported: readonly EvaluatedClaim[],
  correct: readonly EvaluatedClaim[],
  findings: readonly GoldenFinding[],
): StructureScore {
  const [steps, fields] = [ofKind(findings, 'step'), ofKind(findings, 'field')];
  const relations = ofKind(findings, 'relation');
  const stated = supported.filter(
    (claim) =>
      claim.cardType === 'ENT' && mentionsAny(withoutReferenceTypes(claim), RELATION_WORDS),
  );
  const right = stated.filter(
    (claim) => correct.includes(claim) && relations.some((r) => matchesFinding(claim, r)),
  );
  return {
    stepsTotal: steps.length,
    stepsFound: found(correct, steps),
    stepRecall: ratio(found(correct, steps), steps.length),
    fieldsTotal: fields.length,
    fieldsFound: found(correct, fields),
    screenFieldRecall: ratio(found(correct, fields), fields.length),
    relationsStated: stated.length,
    relationsCorrect: right.length,
    relationPrecision: ratio(right.length, stated.length),
    relationClaims: stated.map((claim) => claim.claimId).toSorted(byCodeUnit),
  };
}
