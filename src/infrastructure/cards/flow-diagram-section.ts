import type { Card } from '../../domain/cards/card.js';
import { flowSequenceDiagram } from '../../domain/diagrams/flow-sequence.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { maskCardText } from './mask-card-text.js';

// RF-260, RF-141, RF-508: the sequence diagram of a FLOW card, made by the P2-21 generator from
// masked card text; this file never writes Mermaid itself.

/** A Mermaid diagram inside its fence, followed by an empty line. */
export function fenced(diagram: string): string[] {
  return ['```mermaid', diagram.trimEnd(), '```', ''];
}

/**
 * The `## Sequence diagram` section of a FLOW card file; empty for the other types. `cards` are
 * all the cards of the run, so a step names the card it touches by its title.
 */
export function flowDiagramSection(
  card: Card,
  cards: readonly Card[],
  masker: TextMasker,
): string[] {
  if (card.type !== 'FLOW') return [];
  const masked = maskCardText(cards, masker);
  const flow = masked.find((each) => each.id === card.id);
  if (flow === undefined) return [];
  return ['## Sequence diagram', '', ...fenced(flowSequenceDiagram(flow, masked))];
}
