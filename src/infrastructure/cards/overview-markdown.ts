import {
  NOT_COVERED_TITLE,
  OVERVIEW_TITLES,
  type Overview,
  type OverviewCardRef,
  type OverviewSection,
} from '../../domain/overview/overview.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { cardPath } from './card-markdown.js';
import { markdownEscaper, type MarkdownEscaper } from './markdown-text.js';
import { serialiseOverview } from '../../application/overview/overview-file.js';

// RF-264, RF-507: the overview as Markdown, for `overview.md`, the top of `spec.md` and the top of
// `report.md`. Every statement links its cards; the links are the relative card links Rosetta builds
// (`base` is `../` for the report, which sits one folder down), the text is model text and goes
// through the Markdown escaper, so HTML or a link in a statement is shown, never interpreted.

function cardLink(ref: OverviewCardRef, base: string, esc: MarkdownEscaper): string {
  return `[${esc.label(ref.id)}](${base}${cardPath(ref)})`;
}

function questionLine(
  section: OverviewSection,
  overview: Overview,
  base: string,
  esc: MarkdownEscaper,
): string[] {
  const asked = overview.questions.filter((link) => link.section === section.id);
  if (asked.length === 0) return [];
  const links = asked.map((link) => cardLink({ id: link.cardId, type: 'OQ' }, base, esc));
  return [`Open questions about this section: ${links.join(', ')}`, ''];
}

function sectionLines(
  section: OverviewSection,
  context: { readonly overview: Overview; readonly base: string; readonly heading: string },
  esc: MarkdownEscaper,
): string[] {
  const { overview, base, heading } = context;
  const items = section.statements.map((statement) => {
    const links = statement.cards.map((ref) => cardLink(ref, base, esc)).join(', ');
    return `- ${esc.inline(statement.text)} (${links})`;
  });
  return [
    `${heading} ${OVERVIEW_TITLES[section.id]}`,
    '',
    ...items,
    '',
    ...questionLine(section, overview, base, esc),
  ];
}

/** The overview without its own title: a notice, the sections and what was not covered. */
// RF-264, RF-507
export function overviewBody(
  overview: Overview,
  masker: TextMasker,
  options: { readonly base: string; readonly heading: string },
): string[] {
  const esc = markdownEscaper(masker);
  const context = { overview, ...options };
  const notice = overview.notice === undefined ? [] : [esc.block(overview.notice), ''];
  const covered =
    overview.notCovered.length === 0
      ? ['Every area of the run gave at least one card.']
      : overview.notCovered.map((line) => `- ${esc.inline(line)}`);
  return [
    ...notice,
    ...overview.sections.flatMap((section) => sectionLines(section, context, esc)),
    `${options.heading} ${NOT_COVERED_TITLE}`,
    '',
    ...covered,
    '',
  ];
}

/** The text of `overview.md`. */
// RF-264
export function renderOverview(overview: Overview, masker: TextMasker): string {
  const lines = ['# Overview', '', ...overviewBody(overview, masker, { base: '', heading: '##' })];
  return `${masker.mask(lines.join('\n')).text.trimEnd()}\n`;
}

/** The text of `overview.json`, masked. */
// RF-264
export function renderOverviewJson(overview: Overview, masker: TextMasker): string {
  return masker.mask(serialiseOverview(overview)).text;
}
