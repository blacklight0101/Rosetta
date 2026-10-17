import type { Card } from '../cards/card.js';
import type { Overview, QuestionLink } from './overview.js';

// RF-264: each open question is linked to the overview section it concerns: the first section (in
// the overview's order) whose statements link a card that cites a file the question's card cites.
// A question that shares no file with any statement has no link. Deterministic, no model.

function pathsOf(card: Card): ReadonlySet<string> {
  return new Set(card.claims.flatMap((claim) => claim.citations.map((citation) => citation.path)));
}

// RF-264
export function questionLinks(
  sections: Overview['sections'],
  cards: readonly Card[],
): readonly QuestionLink[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const links: QuestionLink[] = [];
  for (const question of cards.filter((card) => card.type === 'OQ')) {
    const paths = pathsOf(question);
    const section = sections.find((each) =>
      each.statements.some((statement) =>
        statement.cards.some((ref) => {
          const card = byId.get(ref.id);
          return card !== undefined && [...pathsOf(card)].some((path) => paths.has(path));
        }),
      ),
    );
    if (section !== undefined) links.push({ cardId: question.id, section: section.id });
  }
  return links;
}
