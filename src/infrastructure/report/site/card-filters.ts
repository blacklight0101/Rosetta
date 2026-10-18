import { h, type ComponentChild } from 'preact';
import type { ReportCard } from '../../../application/report/report-model.js';
import { CARD_TYPES, CLAIM_STATUSES } from '../../../domain/cards/card-vocabulary.js';

// RF-503, RF-507, RNF-010: the filters of the cards table on the dashboard. The page lists every
// card with no script; `filters.js` shows these controls and hides the rows that do not match. The
// controls start hidden, so a reader without scripts sees no control that does nothing. Each row
// carries what is filtered on (`data-type`, `data-area`, `data-statuses`), and the options are the
// values the cards have, so the script offers only choices that match at least one card. Area names
// are repository text: the renderer escapes them in the options and in the attributes.

/** The statuses of the card's claims (a card matches a status when it has a claim of it). */
function statusesOf(card: ReportCard): string[] {
  return CLAIM_STATUSES.filter((status) => (card.claimCounts[status] ?? 0) > 0);
}

/** The attributes of the row of a card in the table that the filter script reads. */
// RF-503
export function cardRowAttributes(card: ReportCard): Record<string, string> {
  return {
    'data-type': card.type,
    'data-area': card.area,
    'data-statuses': statusesOf(card).join(' '),
  };
}

interface Filter {
  readonly key: 'type' | 'area' | 'status';
  readonly label: string;
  readonly all: string;
  readonly values: readonly string[];
}

function filtersOf(cards: readonly ReportCard[]): readonly Filter[] {
  const types = new Set(cards.map((card) => card.type));
  const statuses = new Set(cards.flatMap(statusesOf));
  const areas = [...new Set(cards.map((card) => card.area))].sort((a, b) => a.localeCompare(b));
  return [
    { key: 'type', label: 'Type', all: 'All types', values: typesInOrder(types) },
    { key: 'area', label: 'Area', all: 'All areas', values: areas },
    {
      key: 'status',
      label: 'Status',
      all: 'All statuses',
      values: CLAIM_STATUSES.filter((status) => statuses.has(status)),
    },
  ];
}

/** The types the cards have: those of the vocabulary first, in its order, then any other, sorted. */
function typesInOrder(types: ReadonlySet<string>): string[] {
  const known = CARD_TYPES.filter((type) => types.has(type));
  const other = [...types].filter((type) => !known.some((each) => each === type)).sort();
  return [...known, ...other];
}

function FilterSelect(props: { readonly filter: Filter }): ComponentChild {
  const { filter } = props;
  const id = `filter-${filter.key}`;
  return h(
    'div',
    { class: 'filter' },
    h('label', { for: id }, filter.label),
    h(
      'select',
      { id, 'data-filter': filter.key },
      h('option', { value: '' }, filter.all),
      filter.values.map((value) => h('option', { value }, value)),
    ),
  );
}

/** The controls, the count and the empty state; the table follows them in the page. */
// RF-503
export function CardFilters(props: { readonly cards: readonly ReportCard[] }): ComponentChild {
  return h(
    'div',
    null,
    h(
      'div',
      {
        class: 'filters',
        role: 'group',
        'aria-label': 'Filter the cards',
        'data-card-filters': true,
        hidden: true,
      },
      filtersOf(props.cards).map((filter) => h(FilterSelect, { filter })),
      h('button', { type: 'button', 'data-filter-reset': true }, 'Reset filters'),
    ),
    h('p', { class: 'status', role: 'status', 'aria-live': 'polite', 'data-filter-status': true }),
    h(
      'p',
      { class: 'empty', 'data-filter-empty': true, hidden: true },
      'No cards match these filters. Use Reset filters to see all of them.',
    ),
  );
}
