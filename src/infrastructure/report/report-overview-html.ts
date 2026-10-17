import {
  NOT_COVERED_TITLE,
  OVERVIEW_TITLES,
  type Overview,
  type OverviewSection,
} from '../../domain/overview/overview.js';
import { cardPath } from '../cards/card-markdown.js';
import { escapeHtml, renderModelText } from './html-text.js';

// RF-264, RF-507: the overview at the top of `report.html`. Statements are model text, so they go
// through `renderModelText`; the card links are the relative ones built here and go up one folder.

function section(part: OverviewSection, overview: Overview): string {
  const items = part.statements.map((statement) => {
    const links = statement.cards
      .map((ref) => `<a href="../${escapeHtml(cardPath(ref))}">${escapeHtml(ref.id)}</a>`)
      .join(', ');
    return `<li>${renderModelText(statement.text)} (${links})</li>`;
  });
  const asked = overview.questions
    .filter((link) => link.section === part.id)
    .map(
      (link) =>
        `<a href="../cards/OQ/${escapeHtml(link.cardId)}.md">${escapeHtml(link.cardId)}</a>`,
    );
  const questions =
    asked.length === 0 ? '' : `\n<p>Open questions about this section: ${asked.join(', ')}</p>`;
  return `<h3>${OVERVIEW_TITLES[part.id]}</h3>\n<ul>\n${items.join('\n')}\n</ul>${questions}`;
}

// RF-264, RF-507
export function overviewHtml(overview: Overview | undefined): string {
  if (overview === undefined) return '';
  const notice =
    overview.notice === undefined ? '' : `\n<p>${renderModelText(overview.notice)}</p>`;
  const covered =
    overview.notCovered.length === 0
      ? '<p>Every area of the run gave at least one card.</p>'
      : `<ul>\n${overview.notCovered.map((line) => `<li>${renderModelText(line)}</li>`).join('\n')}\n</ul>`;
  const parts = overview.sections.map((part) => section(part, overview));
  return `<section aria-labelledby="overview">
<h2 id="overview">Overview</h2>${notice}
${parts.join('\n')}
<h3>${NOT_COVERED_TITLE}</h3>
${covered}
</section>`;
}
