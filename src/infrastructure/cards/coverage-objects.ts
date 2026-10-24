import type { ObjectCoverage } from '../../domain/cards/database-objects.js';
import type { MarkdownEscaper } from './markdown-text.js';

// P5-36, RF-230, data-model 3.8: the `## Database objects` section of `coverage.md`: each table,
// view, procedure, trigger and function the scan found in the areas the run read, with the card
// that states what it does, "named only" (a card names it but none states it) or "no card".

function stateText(object: ObjectCoverage): string {
  if (object.state === 'card') return object.cards.join(', ');
  return object.state === 'named-only' ? 'named only' : 'no card';
}

/** The section; nothing when the areas hold no database object. */
export function objectsSection(objects: readonly ObjectCoverage[], esc: MarkdownEscaper): string[] {
  if (objects.length === 0) return [];
  return [
    '## Database objects',
    '',
    'Each object a script creates, with the card that states what it does. "Named only" means a card names it but none states it; a Deepen reads those and the ones with no card first.',
    '',
    '| Object | Kind | Lines | Card |',
    '|---|---|---|---|',
    ...objects.map(
      (o) =>
        `| ${esc.inline(o.name)} | ${o.kind} | ${esc.inline(o.path)}:${String(o.startLine)}-${String(o.endLine)} | ${stateText(o)} |`,
    ),
    '',
  ];
}
