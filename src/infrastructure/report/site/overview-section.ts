import { h, type ComponentChild } from 'preact';
import {
  NOT_COVERED_TITLE,
  OVERVIEW_TITLES,
  type Overview,
  type OverviewSection,
} from '../../../domain/overview/overview.js';
import { cardPath } from '../../cards/card-markdown.js';
import { ModelText } from './parts.js';

// RF-264, RF-507, ADR-021: the overview at the top of `report.html`. Statements are model text, so
// they go through `ModelText`; the card links are the relative ones built here and go up one folder.

function cardLinks(part: OverviewSection['statements'][number]): ComponentChild[] {
  return part.cards.flatMap((ref, index) => [
    ...(index === 0 ? [] : [h('span', null, ', ')]),
    h('a', { href: `../${cardPath(ref)}` }, ref.id),
  ]);
}

function statement(part: OverviewSection['statements'][number]): ComponentChild {
  return h('li', null, h(ModelText, { text: part.text }), ' (', cardLinks(part), ')');
}

function askedAbout(part: OverviewSection, overview: Overview): ComponentChild {
  const asked = overview.questions.filter((link) => link.section === part.id);
  if (asked.length === 0) return null;
  const links = asked.flatMap((link, index) => [
    ...(index === 0 ? [] : [', ']),
    h('a', { href: `../cards/OQ/${link.cardId}.md` }, link.cardId),
  ]);
  return h('p', null, 'Open questions about this section: ', links);
}

function section(part: OverviewSection, overview: Overview): ComponentChild {
  return h(
    'div',
    null,
    h('h3', null, OVERVIEW_TITLES[part.id]),
    h('ul', null, part.statements.map(statement)),
    askedAbout(part, overview),
  );
}

/** RF-264: the overview opens the report; a run without one adds nothing. */
export function OverviewSection(props: {
  readonly overview: Overview | undefined;
}): ComponentChild {
  const { overview } = props;
  if (overview === undefined) return null;
  const covered =
    overview.notCovered.length === 0
      ? h('p', null, 'Every area of the run gave at least one card.')
      : h(
          'ul',
          null,
          overview.notCovered.map((line) => h('li', null, h(ModelText, { text: line }))),
        );
  return h(
    'section',
    { 'aria-labelledby': 'overview' },
    h('h2', { id: 'overview' }, 'Overview'),
    overview.notice === undefined ? null : h('p', null, h(ModelText, { text: overview.notice })),
    overview.sections.map((part) => section(part, overview)),
    h('h3', null, NOT_COVERED_TITLE),
    covered,
  );
}
