import type { Card } from '../../domain/cards/card.js';
import { flowSequenceDiagram } from '../../domain/diagrams/flow-sequence.js';
import { screenMapDiagram } from '../../domain/diagrams/screen-map.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { cardPath } from './card-markdown.js';
import { fenced } from './flow-diagram-section.js';
import { maskCardText } from './mask-card-text.js';
import { markdownEscaper, type MarkdownEscaper } from './markdown-text.js';

// RF-263, RF-260, RF-261, RF-262, DEC-134: the sections `spec.md` adds for the new card types
// after the areas: the flows (each with its generated sequence diagram), the screens (opened by
// the generated screen map) and the link to `data-model.md`. Each item links its card. A step
// keeps its claim status, so a rejected step stays and is marked (ADR-005). Diagrams are made by
// the P2-21 generators from masked card text; this file never writes Mermaid itself.

function itemHeading(card: Card, esc: MarkdownEscaper): string[] {
  return [`### ${card.id} ${esc.inline(card.title)} ([card file](${cardPath(card)}))`, ''];
}

function flowItem(flow: Card, all: readonly Card[], esc: MarkdownEscaper): string[] {
  const steps = flow.claims.map(
    (claim, index) => `${String(index + 1)}. [${claim.status}] ${esc.inline(claim.text)}`,
  );
  return [
    ...itemHeading(flow, esc),
    ...(flow.flow === undefined
      ? []
      : [
          `Trigger: ${esc.inline(flow.flow.trigger)}`,
          '',
          `Outcome: ${esc.inline(flow.flow.outcome)}`,
          '',
        ]),
    ...fenced(flowSequenceDiagram(flow, all)),
    'Steps:',
    '',
    ...steps,
    '',
  ];
}

function names(values: readonly string[], esc: MarkdownEscaper): string {
  return values.length === 0 ? 'none' : esc.inline(values.join(', '));
}

function screenItem(card: Card, esc: MarkdownEscaper): string[] {
  const { screen } = card;
  return [
    ...itemHeading(card, esc),
    ...(screen === undefined
      ? []
      : [
          `Route: ${esc.inline(screen.route)}`,
          '',
          `Roles: ${names(screen.roles, esc)}`,
          '',
          `Leads to: ${names(screen.leadsTo, esc)}`,
          '',
        ]),
  ];
}

function dataModelLink(entities: number): string[] {
  const count = `${String(entities)} ${entities === 1 ? 'entity' : 'entities'}`;
  return [
    '## Data model',
    '',
    `The legacy data model is in [data-model.md](data-model.md) (${count}).`,
    '',
  ];
}

// RF-263
export function renderSurfaceSections(cards: readonly Card[], masker: TextMasker): string[] {
  const masked = maskCardText(cards, masker);
  const esc = markdownEscaper(masker);
  const flows = masked.filter((card) => card.type === 'FLOW');
  const screens = masked.filter((card) => card.type === 'SCRN');
  const entities = new Set(masked.filter((card) => card.type === 'ENT').map((card) => card.id));
  return [
    ...(flows.length === 0
      ? []
      : ['## Flows', '', ...flows.flatMap((flow) => flowItem(flow, masked, esc))]),
    ...(screens.length === 0
      ? []
      : [
          '## Screens',
          '',
          ...fenced(screenMapDiagram(masked)),
          ...screens.flatMap((screen) => screenItem(screen, esc)),
        ]),
    ...(entities.size === 0 ? [] : dataModelLink(entities.size)),
  ];
}
