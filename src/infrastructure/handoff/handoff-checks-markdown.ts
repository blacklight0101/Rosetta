import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import {
  coverageItems,
  coverageOf,
  type CoverageItem,
} from '../../domain/planning/plan-coverage.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-627, RF-507, RNF-003: checks.md, what the package checks say about itself. The plan coverage
// lists every item (feature, table, operation, journey or screen) that no task card builds, kind by
// kind and by id, so the same package always gives the same list; the run that wrote such a
// package is not complete. Names are model text and go through the escaper; the kinds, ids' prefixes
// and sentences are Rosetta's.

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function rowOf(item: CoverageItem, esc: MarkdownEscaper): string {
  return `| ${item.kind} | ${esc.inline(item.id)} | ${esc.inline(item.name)} |`;
}

function coverageLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { items, uncovered } = coverageOf(coverageItems(handoff), handoff.content.tasks);
  const head = [
    '## Plan coverage',
    '',
    'Every feature of the product requirements document, table of the target data model, operation of the API contract, journey of the target flows and screen of the user-interface material is built by at least one task card that links it by its id. A card that only names an item in its title does not build it.',
    '',
  ];
  if (items.length === 0) {
    return [...head, 'The package has no item to cover.', ''];
  }
  if (uncovered.length === 0) {
    return [...head, 'Every item is built by at least one task card.', ''];
  }
  return [
    ...head,
    `${plural(uncovered.length, 'item')} of ${String(items.length)} ${uncovered.length === 1 ? 'is' : 'are'} built by no task card; the run is not complete.`,
    '',
    '| Kind | Id | Name |',
    '|---|---|---|',
    ...uncovered.map((item) => rowOf(item, esc)),
    '',
  ];
}

// RF-627
export function checksMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return ['# Package checks', '', ...coverageLines(handoff, esc)].join('\n');
}
