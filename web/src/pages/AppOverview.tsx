import type { JSX } from 'preact';
import { cardFilePath, sectionTitles, type RunOverviewData } from '../api/overview.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { RenderedText } from '../components/RenderedText.js';
import { NotCovered } from './NotCovered.js';
import type { OverviewLoad } from './use-run-overview.js';

// RF-264, RF-507, design-system.md section 14: the overview of the application, the first thing
// the page of an ended understand run shows. Each statement links the cards it comes from; the
// notice of a thin overview says what is missing and what to do next. Statements are model text and
// are shown as text. All the styles are under `.rst-p168-`.

type Section = RunOverviewData['sections'][number];

/** The id of the heading of a section: the open questions link to it. */
export function sectionAnchor(id: string): string {
  return `overview-${id}`;
}

function Cards(props: {
  readonly runId: string;
  readonly cards: Section['statements'][number]['cards'];
}): JSX.Element {
  return (
    <span class="rst-p168-cards">
      {' ('}
      {props.cards.map((card, index) => (
        <span key={card.id}>
          {index === 0 ? '' : ', '}
          <a class="rst-mono" href={cardFilePath(props.runId, card)}>
            {card.id}
          </a>
        </span>
      ))}
      {')'}
    </span>
  );
}

function SectionView(props: { readonly runId: string; readonly section: Section }): JSX.Element {
  const { runId, section } = props;
  const headingId = sectionAnchor(section.id);
  return (
    <section class="rst-p168-section" aria-labelledby={headingId}>
      <h3 class="rst-p168-section__title" id={headingId}>
        {sectionTitles[section.id]}
      </h3>
      <ul class="rst-p168-statements">
        {section.statements.map((statement, index) => (
          <li key={index}>
            <RenderedText text={statement.text} />
            <Cards runId={runId} cards={statement.cards} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Body(props: { readonly runId: string; readonly load: OverviewLoad }): JSX.Element {
  const { load, runId } = props;
  if (load.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the overview
      </p>
    );
  }
  if (load.status === 'failed') return <ErrorBanner error={load.error} />;
  const { overview } = load;
  if (overview === null) {
    return <p class="rst-settings__note">This run wrote no overview.</p>;
  }
  return (
    <>
      {overview.notice === undefined ? null : (
        <p
          class={`rst-callout rst-callout--${overview.state === 'full' ? 'info' : 'warn'}`}
          role="status"
          data-testid="overview-notice"
        >
          <RenderedText text={overview.notice} />
        </p>
      )}
      {overview.sections.map((section) => (
        <SectionView key={section.id} runId={runId} section={section} />
      ))}
      <NotCovered lines={overview.notCovered} />
    </>
  );
}

// RF-264
export function AppOverview(props: {
  readonly runId: string;
  readonly load: OverviewLoad;
}): JSX.Element {
  return (
    <section class="rst-card rst-p168-overview" aria-label="Overview of the application">
      <h2 class="rst-live-section__title">Overview of the application</h2>
      <Body {...props} />
    </section>
  );
}
