import { h, type ComponentChild } from 'preact';
import type {
  ReportCardDetail,
  ReportCitation,
  ReportClaim,
} from '../../../application/report/card-detail.js';
import type { ReportModel } from '../../../application/report/report-model.js';
import { formatCitation } from '../../../domain/cards/citation.js';
import { renderPage } from '../page-shell.js';
import { evidenceAnchor } from '../../../domain/sources/evidence-link.js';
import { citationPermalink, isUploadModel } from '../report-source.js';
import { STATUS_GLYPHS, statusLabel } from './claim-status.js';
import { areaLink, Crumbs } from './crumbs.js';
import { Excerpt } from './excerpt.js';
import { areaPageName } from './page-names.js';
import { Glyph, ModelText, Panel } from './parts.js';
import { renderStatic } from './static-render.js';

// RF-500, RF-502, RF-125, RF-507, RF-1013, ADR-021: the page of one card: its facts, then each claim
// with its status and the reason of the verdict, and under each claim its citations: the cited
// lines with context and the permalink to the exact lines on GitHub. Card, claim, reason and path
// are model or repository text and are shown as text; the lines of code are text and nothing else.

interface CitationLink {
  readonly href: string;
  readonly text: string;
  /** RF-131: the id the page gives the citation, for an uploaded project. */
  readonly id?: string;
}

/** RF-125: the permalink to GitHub; RF-131: for an upload, the link to the citation on this page. */
function linkOf(
  model: ReportModel,
  claimId: string,
  citation: ReportCitation,
): CitationLink | undefined {
  if (model.source?.kind === 'upload') {
    const anchor = evidenceAnchor(claimId, citation);
    return anchor === undefined
      ? undefined
      : { href: `#${anchor}`, text: 'Link to these lines', id: anchor };
  }
  const href = citationPermalink(model.source, citation);
  return href === undefined ? undefined : { href, text: 'View on GitHub' };
}

function Citation(props: {
  readonly model: ReportModel;
  readonly claimId: string;
  readonly citation: ReportCitation;
  /** False for a citation that repeats an earlier one of the claim: the id is the first one's. */
  readonly first: boolean;
}): ComponentChild {
  const { model, claimId, citation, first } = props;
  const link = linkOf(model, claimId, citation);
  return h(
    'li',
    { class: 'citation', id: first ? link?.id : undefined },
    h(
      'p',
      { class: 'citation-head' },
      h('span', { class: 'citation-name mono' }, formatCitation(citation)),
      link === undefined
        ? null
        : h(
            'a',
            { class: 'permalink', href: link.href, rel: 'noopener noreferrer nofollow' },
            link.text,
          ),
    ),
    h(Excerpt, { citation }),
  );
}

/** The same file and lines. */
function sameLines(a: ReportCitation, b: ReportCitation): boolean {
  return a.path === b.path && a.startLine === b.startLine && a.endLine === b.endLine;
}

function Claim(props: {
  readonly model: ReportModel;
  readonly claim: ReportClaim;
}): ComponentChild {
  const { model, claim } = props;
  return h(
    'li',
    { class: 'claim', id: claim.claimId },
    h(
      'p',
      { class: 'claim-head' },
      h(
        'span',
        { class: `claim-status status-${claim.status}` },
        h(Glyph, { name: STATUS_GLYPHS[claim.status] ?? 'dot' }),
        statusLabel(claim.status),
      ),
      ' ',
      h('span', { class: 'mono' }, claim.claimId),
    ),
    h('p', { class: 'claim-text' }, h(ModelText, { text: claim.text })),
    claim.reason === undefined
      ? null
      : h(
          'p',
          { class: 'claim-verdict' },
          h('span', { class: 'label' }, 'Verifier: '),
          h('span', { class: 'claim-reason' }, h(ModelText, { text: claim.reason })),
        ),
    h(
      'ul',
      { class: 'citations' },
      claim.citations.map((citation, index) =>
        h(Citation, {
          ...{ model, claimId: claim.claimId, citation },
          first: claim.citations.findIndex((each) => sameLines(each, citation)) === index,
        }),
      ),
    ),
  );
}

function Facts(props: { readonly card: ReportCardDetail }): ComponentChild {
  const { card } = props;
  const rows: [string, ComponentChild][] = [
    ['Type', card.type],
    ['Area', areaLink(card.area, h(ModelText, { text: card.area }))],
    ['Confidence', card.confidence],
  ];
  return h(
    'dl',
    { class: 'facts card-facts' },
    rows.map(([name, value]) => h('div', null, h('dt', null, name), h('dd', null, value))),
  );
}

function QuestionPanel(props: { readonly card: ReportCardDetail }): ComponentChild {
  const { question, whyItMatters, questionState } = props.card;
  if (question === undefined) return null;
  return h(
    Panel,
    { id: 'question', title: `Question (${questionState ?? 'Open'})` },
    h('p', null, h(ModelText, { text: question })),
    whyItMatters === undefined
      ? null
      : h('p', { class: 'context' }, 'Why it matters: ', h(ModelText, { text: whyItMatters })),
  );
}

function CardPage(props: {
  readonly model: ReportModel;
  readonly card: ReportCardDetail;
}): ComponentChild {
  const { model, card } = props;
  const { id, type, title } = card;
  return h(
    'div',
    null,
    h(Crumbs, {
      items: [
        { href: 'report.html', label: 'Dashboard' },
        { href: areaPageName(card.area), label: h(ModelText, { text: card.area }) },
        { label: id },
      ],
    }),
    h('h1', null, `${id} `, h(ModelText, { text: title })),
    h(Facts, { card }),
    h('p', null, h(ModelText, { text: card.summary })),
    card.note === undefined ? null : h('p', { class: 'card-note' }, card.note),
    h(QuestionPanel, { card }),
    h(
      'section',
      { 'aria-labelledby': 'claims-title' },
      h('h2', { id: 'claims-title' }, 'Claims and evidence'),
      h(
        'ol',
        { id: 'claims', class: 'claims' },
        card.claims.map((claim) => h(Claim, { model, claim })),
      ),
    ),
    h('p', null, h('a', { href: `../cards/${type}/${id}.md` }, 'Card file')),
  );
}

/** The page of a card. */
// RF-502, RF-125, RF-507
export function renderCardPage(model: ReportModel, card: ReportCardDetail): string {
  const main = renderStatic(h(CardPage, { model, card }));
  return renderPage({
    page: 'card',
    runKey: model.runKey,
    title: card.id,
    main,
    upload: isUploadModel(model),
  });
}
