import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-650, RF-648, RF-625, RF-626, DEC-150: a workbook has no journey or screen to read, so the
// package takes them from the owner's answers and the tables of the data model: `ux/` lists a screen
// set per table with its fields, `flows/` lists the sign-in journey and one journey per table. Only a
// package of a project of workbooks has them; table and column names are model text, escaped.

const NO_SCREEN = 'No screen was asked for: the answer to the screens question is "No screens".';

/** The screens of one table for the answer: list and search always, edit unless read only. */
function screensOf(option: string): readonly ('List' | 'Edit' | 'Search')[] {
  if (option === 'none') return [];
  return option === 'read-only' ? ['List', 'Search'] : ['List', 'Edit', 'Search'];
}

// RF-650
export function workbookScreenLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { workbook } = handoff;
  if (workbook === undefined) return [];
  const kinds = screensOf(workbook.screens.option);
  const heading = ['## Screens per register', ''];
  if (kinds.length === 0) return [...heading, NO_SCREEN, ''];
  return [
    ...heading,
    `Screens asked for: ${esc.inline(workbook.screens.words)}. One set per table of the [data model](../data-model.md), with its fields.`,
    '',
    ...handoff.dataModel.tables.flatMap((table) => {
      const fields = table.columns.map((column) => esc.inline(column.name)).join(', ');
      const name = esc.inline(table.name);
      return [`### ${name}`, '', ...kinds.map((kind) => `- ${kind} ${name}: ${fields}`), ''];
    }),
  ];
}

// RF-650, RF-648
export function workbookJourneyLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { workbook } = handoff;
  if (workbook === undefined) return [];
  const kinds = screensOf(workbook.screens.option);
  return [
    '## Journeys of the new application',
    '',
    "The workbook has no journey to read, so these come from the owner's answers and the tables of the data model.",
    '',
    `- Sign in with ${esc.inline(workbook.signIn.words)}`,
    ...(kinds.length === 0
      ? ['', NO_SCREEN]
      : handoff.dataModel.tables.map((table) => {
          const verb = kinds.includes('Edit') ? 'Find, add and change' : 'Find';
          return `- ${verb} ${esc.inline(table.name)}`;
        })),
    '',
  ];
}
