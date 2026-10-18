import { Fragment, h, type ComponentChild, type ComponentChildren } from 'preact';
import { modelTextParts } from '../html-text.js';

// RF-500, RF-507, DEC-44, ADR-021: the small components the report pages share. Text from the
// analysed code or from a model goes through `ModelText`, which shows it as text and keeps only the
// `https://github.com/` Markdown links; the renderer escapes everything else.

/** Model text: plain text, with a github.com Markdown link kept as a link (RF-507). */
export function ModelText(props: { readonly text: string }): ComponentChild {
  const parts: ComponentChild[] = modelTextParts(props.text).map((part) =>
    part.kind === 'text'
      ? part.text
      : h('a', { href: part.address, rel: 'noopener noreferrer nofollow' }, part.label),
  );
  return h(Fragment, null, parts);
}

/** A section of a page: a heading and what it holds, labelled by its heading. */
export function Panel(props: {
  readonly id: string;
  readonly title: string;
  readonly children?: ComponentChildren;
}): ComponentChild {
  const titleId = `${props.id}-title`;
  return h(
    'section',
    { id: props.id, 'aria-labelledby': titleId, class: 'panel' },
    h('h2', { id: titleId }, props.title),
    props.children,
  );
}

/** The one sentence a panel is about. */
export function Headline(props: { readonly children?: ComponentChildren }): ComponentChild {
  return h('p', { class: 'headline' }, props.children);
}

/** Names and values in boxes, as the facts of a run. */
export function Facts(props: {
  readonly rows: readonly (readonly [string, ComponentChildren])[];
}): ComponentChild {
  return h(
    'dl',
    { class: 'facts' },
    props.rows.map(([name, value]) => h('div', null, h('dt', null, name), h('dd', null, value))),
  );
}

/** A table that scrolls on its own and stacks its cells on a phone (each cell carries its column). */
export function DataTable(props: {
  readonly id?: string;
  /** Another class of the table besides `stacked`. */
  readonly tableClass?: string;
  readonly label: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly ComponentChildren[])[];
  /** Attributes of each row, in the order of `rows` (a script reads them; a row without any gets none). */
  readonly rowAttributes?: readonly Readonly<Record<string, string>>[];
}): ComponentChild {
  const head = props.columns.map((name) => h('th', { scope: 'col' }, name));
  const body = props.rows.map((cells, row) =>
    h(
      'tr',
      props.rowAttributes?.[row] ?? null,
      cells.map((cell, index) => h('td', { 'data-label': props.columns[index] ?? '' }, cell)),
    ),
  );
  return h(
    'div',
    { class: 'table-wrap', role: 'region', 'aria-label': props.label, tabindex: 0 },
    h(
      'table',
      {
        class: props.tableClass === undefined ? 'stacked' : `${props.tableClass} stacked`,
        ...(props.id === undefined ? {} : { id: props.id }),
      },
      h('thead', null, h('tr', null, head)),
      h('tbody', null, body),
    ),
  );
}

const GLYPHS: Readonly<Record<string, string>> = {
  check: 'M2 6.5 5 9l5-6',
  cross: 'M3 3l6 6M9 3 3 9',
  warning: 'M6 2v5M6 9.5v.5',
  dot: 'M6 4v4',
  open: 'M3 6h6',
};

/** A small drawing that goes with a word; the word carries the meaning, so a reader skips it. */
export function Glyph(props: { readonly name: string }): ComponentChild {
  return h(
    'svg',
    { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true', class: 'glyph' },
    h('path', {
      d: GLYPHS[props.name] ?? GLYPHS['dot'],
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.8,
    }),
  );
}
