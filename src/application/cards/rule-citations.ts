import type { CardDraft } from '../../domain/cards/card-ids.js';
import { isValuesFile } from '../../domain/sources/rendered-workbook-files.js';
import type { OutputProblem } from './output-problem.js';

// RF-208, RF-206, P3-105, EV-08: a rule of a workbook is shown by its formula or its macro, and a
// value only says what the formula gave once. A `BR` or `FLOW` claim that cites nothing but lines of
// `values.md` is asked once for the line of `formulas.md` (or of the macro module) that shows the
// rule. The question is a hint, not a fault: the claim is kept whatever the answer, and the
// problems of the answer do not list it.

const RULE_TYPES: readonly string[] = ['BR', 'FLOW'];

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}...` : flat;
}

/** The rule claims of these cards that cite only values lines, one problem each. */
export function valuesOnlyRuleProblems(drafts: readonly CardDraft[]): readonly OutputProblem[] {
  return drafts
    .filter((draft) => RULE_TYPES.includes(draft.type))
    .flatMap((draft) =>
      draft.claims.flatMap((claim, index) => {
        const only =
          claim.citations.length > 0 && claim.citations.every((c) => isValuesFile(c.path));
        if (!only) return [];
        return {
          path: `${draft.type} "${draft.title}" claim ${String(index + 1)}`,
          message: `"${excerpt(claim.text)}" cites only values.md lines, which show what a formula gave and not the rule. Cite the line of formulas.md (or of the macro module) that holds the rule, or remove the claim.`,
        };
      }),
    );
}
