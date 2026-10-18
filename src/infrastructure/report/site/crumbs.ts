import { h, type ComponentChild, type ComponentChildren } from 'preact';
import type { ReportCard, ReportModel } from '../../../application/report/report-model.js';
import { areaPageName, cardPageName } from './page-names.js';

// RF-500, ADR-021: the way back from an area or card page, and the links between the pages.

export interface Crumb {
  /** Omitted for the page the reader is on. */
  readonly href?: string;
  readonly label: ComponentChildren;
}

/** A trail of links ending at the current page. */
export function Crumbs(props: { readonly items: readonly Crumb[] }): ComponentChild {
  const last = props.items.length - 1;
  return h(
    'nav',
    { class: 'crumbs', 'aria-label': 'Breadcrumb' },
    props.items.map((item, index) =>
      h(
        'span',
        null,
        item.href === undefined
          ? h('span', { 'aria-current': 'page' }, item.label)
          : h('a', { href: item.href }, item.label),
        index === last ? null : ' / ',
      ),
    ),
  );
}

/** Where a card is read: its page when it has one, else its card file in the run folder. */
export function cardHref(model: ReportModel, card: Pick<ReportCard, 'id' | 'path'>): string | null {
  if (model.cardDetails.some((detail) => detail.id === card.id)) return cardPageName(card.id);
  return card.path === '' ? null : `../${card.path}`;
}

/** A link to the page of an area; the label is the area name, shown as text. */
export function areaLink(area: string, label: ComponentChildren): ComponentChild {
  return h('a', { href: areaPageName(area) }, label);
}
