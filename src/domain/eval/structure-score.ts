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

/**
 * The noun "reference type" is not a relation between two entities; the verb "references type X"
 * is one. The noun is recognised by its position, not by a list of words that may precede it:
 * - after a determiner or possessive ("a", "an", "the", "is", "be", "this", "these", "those", "its",
 *   "their", "each", "every", "any", "some", "our", "your", "his", "her", "my"), in any number;
 * - after "that" only in the singular, since a plural "that reference types" is a relative clause;
 * - the plural with no determiner, at the start of a sentence or after "and", "or" or a comma.
 * The verb is never matched: its "references" has an "s", and a plural subject before "reference
 * types" (for example "Items reference types") is not one of the positions above.
 */
const NOUN_AFTER_DETERMINER =
  /(?<=\b(?:a|an|the|is|be|this|these|those|its|their|each|every|any|some|our|your|his|her|my)\s+)reference[- ]typ\w*/giu;
const NOUN_AFTER_THAT = /(?<=\bthat\s+)reference[- ]type(?!s\b)\w*/giu;
const PLURAL_NOUN_AT_START = /(?<=(?:^|[.;:!?,]|\b(?:and|or))\s*)reference[- ]types\b/giu;
const REFERENCE_TYPE_NOUNS = [NOUN_AFTER_DETERMINER, NOUN_AFTER_THAT, PLURAL_NOUN_AT_START];

function withoutReferenceTypes(claim: EvaluatedClaim): EvaluatedClaim {
  const strip = (text: string): string =>
    REFERENCE_TYPE_NOUNS.reduce((rest, noun) => rest.replace(noun, ' '), text);
  return { ...claim, cardTitle: strip(claim.cardTitle), text: strip(claim.text) };
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
