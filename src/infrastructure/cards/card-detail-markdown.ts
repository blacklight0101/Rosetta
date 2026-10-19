import type { Card, Claim } from '../../domain/cards/card.js';
import { formatCitation } from '../../domain/cards/citation.js';
import { incompleteSteps, isUnsupported } from '../../domain/cards/flow-completeness.js';
import type { CitedText, ScreenAction, ScreenField } from '../../domain/cards/flow-screen.js';
import {
  citationLink,
  FROM_CARD_FILE,
  type CitationSpot,
  type PermalinkSource,
} from './citation-link.js';
import type { MarkdownEscaper } from './markdown-text.js';

// RF-260, RF-261, data-model 3.7: what a FLOW or SCRN card adds to its file. The header keys are
// plain data (the writer masks them); the body is generated, with model text escaped.

function citedHeader(item: CitedText): Record<string, unknown> {
  return { text: item.text, citations: item.citations.map(formatCitation) };
}

/** The step keys of a claim in the header: what it touches and its numbered branches. */
export function stepHeader(claim: Claim): Record<string, unknown> {
  return {
    target: claim.target,
    branches: claim.branches?.map((branch) => ({ number: branch.number, ...citedHeader(branch) })),
  };
}

function fieldHeader(field: ScreenField): Record<string, unknown> {
  return {
    name: field.name,
    inputKind: field.inputKind,
    required: field.required,
    validations: field.validations.map(citedHeader),
  };
}

function actionHeader(action: ScreenAction): Record<string, unknown> {
  return { label: action.label, handler: action.handler, flow: action.flow };
}

/** The `flow` and `screen` keys of the header; absent for the other types. */
export function detailHeader(card: Card): Record<string, unknown> {
  const { flow, screen } = card;
  const steps = incompleteSteps(card).map((step) => step.claimId);
  return {
    flow,
    // RF-260: a flow with a step whose citation is invalid or rejected is incomplete.
    incomplete: card.type === 'FLOW' ? steps.length > 0 : undefined,
    incompleteSteps: steps.length === 0 ? undefined : steps,
    screen: screen && {
      route: screen.route,
      roles: screen.roles,
      fields: screen.fields.map(fieldHeader),
      actions: screen.actions.map(actionHeader),
      leadsTo: screen.leadsTo,
    },
  };
}

function flowBody(card: Card, esc: MarkdownEscaper): string[] {
  if (card.flow === undefined) return [];
  const { trigger, outcome } = card.flow;
  const marked = incompleteSteps(card).map((step) => `${step.claimId} (${step.status})`);
  const incomplete = marked.length === 0 ? [] : [`Incomplete: ${marked.join(', ')}`, ''];
  return [
    '## Flow',
    '',
    'Trigger:',
    '',
    esc.block(trigger),
    '',
    'Outcome:',
    '',
    esc.block(outcome),
    '',
    ...incomplete,
  ];
}

/** Where the citations of a card file are written: in `cards/<TYPE>/`, in a claim or not. */
function spotOf(card: Pick<Card, 'id'>, claimId?: string): CitationSpot {
  return { cardId: card.id, claimId, base: FROM_CARD_FILE };
}

function evidence(item: CitedText, source: PermalinkSource, spot: CitationSpot): string {
  return item.citations.map((citation) => citationLink(citation, source, spot)).join(', ');
}

function fieldLines(
  field: ScreenField,
  where: { readonly source: PermalinkSource; readonly spot: CitationSpot },
  esc: MarkdownEscaper,
): string[] {
  const kind = `${esc.inline(field.inputKind)}, ${field.required ? 'required' : 'optional'}`;
  const validations = field.validations.map(
    (item) =>
      `  - Validation: ${esc.inline(item.text)} (${evidence(item, where.source, where.spot)})`,
  );
  return [`- ${esc.inline(field.name)} (${kind})`, ...validations];
}

function actionLine(action: ScreenAction, esc: MarkdownEscaper): string {
  const starts = [
    action.handler === undefined ? '' : `handler ${esc.inline(action.handler)}`,
    action.flow === undefined ? '' : `FLOW ${esc.inline(action.flow)}`,
  ].filter((part) => part !== '');
  return `- ${esc.inline(action.label)}: ${starts.join(', ')}`;
}

function list(values: readonly string[], esc: MarkdownEscaper): string {
  return values.length === 0 ? 'none' : values.map((value) => esc.inline(value)).join(', ');
}

function screenBody(card: Card, source: PermalinkSource, esc: MarkdownEscaper): string[] {
  const { screen } = card;
  if (screen === undefined) return [];
  return [
    '## Screen',
    '',
    `Route: ${esc.inline(screen.route)}`,
    '',
    `Roles: ${list(screen.roles, esc)}`,
    '',
    `Leads to: ${list(screen.leadsTo, esc)}`,
    '',
    'Fields:',
    '',
    ...screen.fields.flatMap((field) => fieldLines(field, { source, spot: spotOf(card) }, esc)),
    '',
    'Actions:',
    '',
    ...screen.actions.map((action) => actionLine(action, esc)),
    '',
  ];
}

/** The `## Flow` or `## Screen` section; empty for the other types. */
export function detailBody(card: Card, source: PermalinkSource, esc: MarkdownEscaper): string[] {
  return [...flowBody(card, esc), ...screenBody(card, source, esc)];
}

/** What a FLOW step touches and its branches, under the step's text. */
export function stepBody(
  card: Pick<Card, 'id'>,
  claim: Claim,
  source: PermalinkSource,
  esc: MarkdownEscaper,
): string[] {
  const touches = claim.target === undefined ? [] : [`Touches: ${esc.label(claim.target)}`, ''];
  const branches = (claim.branches ?? []).map(
    (branch) =>
      `Branch ${String(branch.number)}: ${esc.inline(branch.text)} (${evidence(branch, source, spotOf(card, claim.claimId))})`,
  );
  return [...touches, ...branches, ...(branches.length === 0 ? [] : [''])];
}

/** RF-260: the line under a step of a flow that is invalid or rejected; none for other claims. */
export function stepMark(card: Pick<Card, 'type'>, claim: Claim): string[] {
  const marked = card.type === 'FLOW' && isUnsupported(claim);
  return marked ? ['Marked: this step is not supported by its citation.', ''] : [];
}
