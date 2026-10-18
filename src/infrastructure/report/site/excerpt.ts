import { h, type ComponentChild } from 'preact';
import type { ReportCitation } from '../../../application/report/card-detail.js';

// RF-502, RF-507, ADR-013: the cited lines of a citation, with their context, as a table: a mark for
// the cited lines (a character, not only a colour), the line number and the line. A line is source
// code of the analysed repository: it is shown as text, never as a link or as markup.

function inRange(line: number, citation: ReportCitation): boolean {
  return line >= citation.startLine && line <= citation.endLine;
}

/** The lines of a citation, or the reason they are not shown. */
export function Excerpt(props: { readonly citation: ReportCitation }): ComponentChild {
  const { citation } = props;
  const { excerpt } = citation;
  if (excerpt.kind === 'unavailable') {
    return h('p', { class: 'excerpt-unavailable' }, excerpt.reason);
  }
  const rows = excerpt.lines.map((text, index) => {
    const number = excerpt.firstLine + index;
    const cited = inRange(number, citation);
    return h(
      'tr',
      { class: cited ? 'cited' : undefined },
      h('td', { class: 'mark' }, cited ? '>' : ''),
      h('td', { class: 'ln' }, String(number)),
      h('td', { class: 'src' }, text),
    );
  });
  return h(
    'div',
    {
      class: 'table-wrap',
      role: 'region',
      'aria-label': `Lines of ${citation.path}`,
      tabindex: 0,
    },
    h('table', { class: 'code' }, h('tbody', null, rows)),
  );
}
