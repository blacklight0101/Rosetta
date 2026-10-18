import { h, type ComponentChild } from 'preact';
import type { ReportCard, ReportModel } from '../../../application/report/report-model.js';
import { formatShare } from '../../../domain/cards/verification-summary.js';
import { renderPage } from '../page-shell.js';
import { claimsText } from '../report-format.js';
import { cardHref, Crumbs } from './crumbs.js';
import { DataTable, ModelText, Panel } from './parts.js';
import { renderStatic } from './static-render.js';

// RF-500, RF-507, RF-1013, ADR-021: the page of one area: how it was mapped and read, what went
// wrong in it, and its cards, each linked to its page. The area name and the notes are repository
// or model text and are shown as text.

function AreaFacts(props: { readonly model: ReportModel; readonly area: string }): ComponentChild {
  const { model, area } = props;
  const mapped = model.areas.find((each) => each.name === area);
  const read = model.coverage?.areas.find((each) => each.area === area);
  const rows: [string, string][] = [
    ...(mapped === undefined ? [] : [['Map level', mapped.mapLevel] as [string, string]]),
    ...(read === undefined
      ? []
      : ([
          ['Files read', `${String(read.filesRead)} of ${String(read.filesListed)}`],
          ['Tokens read', formatShare(read.readTokenShare)],
        ] satisfies [string, string][])),
    ['Cards', String(model.cards.filter((card) => card.area === area).length)],
  ];
  return h(
    'dl',
    { class: 'facts area-facts' },
    rows.map(([name, value]) => h('div', null, h('dt', null, name), h('dd', null, value))),
  );
}

function AreaNotes(props: { readonly model: ReportModel; readonly area: string }): ComponentChild {
  const read = props.model.coverage?.areas.find((each) => each.area === props.area);
  const texts = [read?.failure, read?.note].filter((text): text is string => text !== undefined);
  if (texts.length === 0) return null;
  return h(
    Panel,
    { id: 'area-notes', title: 'Notes' },
    texts.map((text) => h('p', null, h(ModelText, { text }))),
  );
}

function idCell(model: ReportModel, card: ReportCard): ComponentChild {
  const href = cardHref(model, card);
  return href === null ? card.id : h('a', { href }, card.id);
}

function AreaCards(props: { readonly model: ReportModel; readonly area: string }): ComponentChild {
  const { model, area } = props;
  const cards = model.cards.filter((card) => card.area === area);
  return h(
    Panel,
    { id: 'area-cards', title: 'Cards' },
    cards.length === 0
      ? h('p', null, 'This area has no cards.')
      : h(DataTable, {
          label: 'Cards of the area',
          columns: ['Card', 'Type', 'Claims', 'Title'],
          rows: cards.map((card) => [
            idCell(model, card),
            card.type,
            claimsText(card.claimCounts),
            h(ModelText, { text: card.title }),
          ]),
        }),
  );
}

function AreaPage(props: { readonly model: ReportModel; readonly area: string }): ComponentChild {
  const { model, area } = props;
  return h(
    'div',
    null,
    h(Crumbs, {
      items: [{ href: 'report.html', label: 'Dashboard' }, { label: h(ModelText, { text: area }) }],
    }),
    h('h1', null, 'Area ', h(ModelText, { text: area })),
    h(AreaFacts, { model, area }),
    h(AreaNotes, { model, area }),
    h(AreaCards, { model, area }),
  );
}

/** The page of an area. */
// RF-500, RF-507
export function renderAreaPage(model: ReportModel, area: string): string {
  const main = renderStatic(h(AreaPage, { model, area }));
  return renderPage({ page: 'area', runKey: model.runKey, title: 'Area', main });
}
