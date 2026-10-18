import type { Citation } from './citation.js';
import type { ScreenAction, ScreenDetail, ScreenField } from './flow-screen.js';

// RF-261, RF-300, RF-301, ADR-005, DEC-134: the validations and actions of a screen are claims of
// its card, so both verifier steps check them like any other claim. A validation cites the lines
// the agent gave it. An action carries no citation of its own, so it cites the lines of the claims
// the agent wrote for the screen: the verifier judges whether those lines show the action.

/** A claim before the card numbers it. */
interface DerivedClaim {
  readonly text: string;
  readonly citations: readonly Citation[];
}

function validationClaim(field: ScreenField, validation: ScreenField['validations'][number]) {
  const kind = `${field.inputKind}, ${field.required ? 'required' : 'optional'}`;
  return {
    text: `Field ${field.name} (${kind}) validation: ${validation.text}`,
    citations: validation.citations,
  };
}

function startsOf(action: ScreenAction): string {
  const handler = action.handler === undefined ? [] : [`the handler ${action.handler}`];
  const flow = action.flow === undefined ? [] : [`the flow ${action.flow}`];
  return [...handler, ...flow].join(' and ');
}

/** The citations of the screen's own claims, each range once, in the order written. */
function screenEvidence(claims: readonly DerivedClaim[]): readonly Citation[] {
  const seen = new Set<string>();
  const evidence: Citation[] = [];
  for (const citation of claims.flatMap((claim) => claim.citations)) {
    const key = `${citation.path}:${String(citation.startLine)}-${String(citation.endLine)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(citation);
  }
  return evidence;
}

/** The text of the claim that states an action, so a reader of the card can find it again (RF-626). */
export function actionClaimText(action: ScreenAction): string {
  return `Action ${action.label} starts ${startsOf(action)}.`;
}

/** The claims a screen adds to the ones the agent wrote: its validations, then its actions. */
export function screenClaims(
  screen: ScreenDetail,
  written: readonly DerivedClaim[],
): readonly DerivedClaim[] {
  const validations = screen.fields.flatMap((field) =>
    field.validations.map((validation) => validationClaim(field, validation)),
  );
  const evidence = screenEvidence(written);
  const actions = screen.actions.map((action) => ({
    text: actionClaimText(action),
    citations: evidence,
  }));
  return [...validations, ...actions];
}
