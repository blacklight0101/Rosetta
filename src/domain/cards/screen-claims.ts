import type { Citation } from './citation.js';
import type { ScreenAction, ScreenDetail, ScreenField } from './flow-screen.js';

// RF-261, RF-300, RF-301, RF-626, ADR-005, DEC-134: the validations, actions, route, roles, fields
// and links of a screen are claims of its card, so both verifier steps check them like any other
// claim. A validation cites the lines the agent gave it. The rest carry no citation of its own, so
// each cites the lines of the claims the agent wrote for the screen: the verifier judges whether
// those lines show it. `plan` keeps one only when its claim is `Supported` (the texts are in one
// place, here, so the card and the plan agree on them).

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

/** The actions that start the same handler and flow, in the order first seen (P3-106). */
function actionGroups(actions: readonly ScreenAction[]): readonly (readonly ScreenAction[])[] {
  const groups = new Map<string, ScreenAction[]>();
  for (const action of actions) {
    const key = JSON.stringify([action.handler, action.flow]);
    const group = groups.get(key) ?? [];
    if (group.length === 0) groups.set(key, group);
    if (!group.some((each) => each.label === action.label)) group.push(action);
  }
  return [...groups.values()];
}

function listOf(labels: readonly string[]): string {
  const last = labels.at(-1) ?? '';
  return labels.length < 2 ? last : `${labels.slice(0, -1).join(', ')} and ${last}`;
}

/**
 * The claim text for the actions of one group (P3-106, EV-06): one action keeps the text of
 * `actionClaimText`; several that start the same handler are one claim that lists the controls.
 */
function groupClaimText(group: readonly ScreenAction[]): string {
  const [first] = group;
  if (first === undefined) return '';
  if (group.length === 1) return actionClaimText(first);
  return `Actions ${listOf(group.map((action) => action.label))} start ${startsOf(first)}.`;
}

/**
 * The texts that can state `action` among the `actions` of a screen: its own claim from before
 * actions were grouped and the claim of its group (P3-106). `plan` keeps the action when either is
 * Supported.
 */
export function actionClaimTexts(
  actions: readonly ScreenAction[],
  action: ScreenAction,
): readonly string[] {
  const same = (other: ScreenAction): boolean =>
    other.label === action.label && other.handler === action.handler && other.flow === action.flow;
  const group = actionGroups(actions).find((each) => each.some(same));
  return [...new Set([actionClaimText(action), groupClaimText(group ?? [action])])];
}

/** The text of the claim that states an action, so a reader of the card can find it again (RF-626). */
export function actionClaimText(action: ScreenAction): string {
  return `Action ${action.label} starts ${startsOf(action)}.`;
}

/** The claim that states the route of a screen (RF-626). */
export function routeClaimText(route: string): string {
  return `The screen is at the route ${route}.`;
}

/** The claim that states a role that can open a screen (RF-626). */
export function roleClaimText(role: string): string {
  return `The role ${role} can open the screen.`;
}

/** The claim that states a field of a screen (RF-626). */
export function fieldClaimText(field: Omit<ScreenField, 'validations'>): string {
  const kind = `${field.inputKind}, ${field.required ? 'required' : 'optional'}`;
  return `Field ${field.name} (${kind}) is on the screen.`;
}

/** The claim that states a link from a screen to another (RF-626). */
export function leadsToClaimText(target: string): string {
  return `The screen leads to ${target}.`;
}

export type DetailKind = 'route' | 'role' | 'field' | 'leadsTo';

/**
 * The kind of detail a claim text states, when it is one of the claims above (RF-626). It reads the
 * fixed words around the value, which masking never changes, so `plan` can tell a card that has
 * such claims from an old one even when masking altered the value inside the text.
 */
export function detailKindOf(text: string): DetailKind | undefined {
  if (text.startsWith('The screen is at the route ')) return 'route';
  if (text.startsWith('The role ')) return 'role';
  if (text.startsWith('The screen leads to ')) return 'leadsTo';
  if (text.startsWith('Field ') && text.includes(') is on the screen')) return 'field';
  return undefined;
}

/** The texts of the claims that state the route, roles, fields and links of a screen. */
function detailTexts(screen: ScreenDetail): readonly string[] {
  return [
    routeClaimText(screen.route),
    ...screen.roles.map(roleClaimText),
    ...screen.fields.map(fieldClaimText),
    ...screen.leadsTo.map(leadsToClaimText),
  ];
}

/**
 * The claims a screen adds to the ones the agent wrote: its validations, its actions, then its
 * route, roles, fields and links.
 */
export function screenClaims(
  screen: ScreenDetail,
  written: readonly DerivedClaim[],
): readonly DerivedClaim[] {
  const validations = screen.fields.flatMap((field) =>
    field.validations.map((validation) => validationClaim(field, validation)),
  );
  const evidence = screenEvidence(written);
  const actions = actionGroups(screen.actions).map((group) => ({
    text: groupClaimText(group),
    citations: evidence,
  }));
  const detail = detailTexts(screen).map((text) => ({ text, citations: evidence }));
  return [...validations, ...actions, ...detail];
}
