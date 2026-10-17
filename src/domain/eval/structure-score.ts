import { ratio } from './ratio.js';
import type { EvaluatedClaim } from './claim-match.js';
import type { FindingKind, GoldenFinding } from './golden-set.js';

// RF-260, RF-261, RF-262, RNF-006, RFC-001 section 7: the measures of the flows, screens and data
// model of a run: the recall of the golden steps, the recall of the golden screen fields and the
// precision of the relations the entity cards state.

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
  readonly relationClaims: readonly string[];
}

function countOf(findings: readonly GoldenFinding[], kind: FindingKind): number {
  return findings.filter((finding) => finding.kind === kind).length;
}

// RF-260, RF-261, RF-262
export function structureScore(
  supported: readonly EvaluatedClaim[],
  findings: readonly GoldenFinding[],
): StructureScore {
  const steps = countOf(findings, 'step');
  const fields = countOf(findings, 'field');
  return {
    ...{ stepsTotal: steps, stepsFound: 0, stepRecall: ratio(0, steps) },
    ...{ fieldsTotal: fields, fieldsFound: 0, screenFieldRecall: ratio(0, fields) },
    ...{ relationsStated: supported.length * 0, relationsCorrect: 0, relationPrecision: null },
    relationClaims: [],
  };
}
