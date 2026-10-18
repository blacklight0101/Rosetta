import { Fragment, type JSX } from 'preact';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import { RenderedText } from '../components/RenderedText.js';
import {
  cardViewsOf,
  type CardSummary,
  type CardView,
  type CountKind,
} from '../lib/live-run/card-checks.js';
import { judgementPending } from '../lib/live-run/judgement-state.js';
import type { ClaimRow, RunState, SourceState } from '../lib/live-run/run-state.js';
import { ClaimsList } from './ClaimsList.js';

// RF-1004, RF-1014, RF-1015, DEC-137: the "Cards so far" tab: one row per card the agents wrote,
// with the counts of its claims per status, then the claims with their status and cited lines (the
// verification view). Card titles and claim text come from a model and are shown as text.

interface Mark {
  readonly kind: CountKind;
  readonly text: string;
}

// The glyphs of the claim-status badges (badge-specs.ts): a count is its glyph and its words.
const glyphOf: Readonly<Record<CountKind, GlyphName>> = {
  supported: 'check',
  rejected: 'cross',
  'citation-invalid': 'broken-link',
  unverified: 'question',
  'not-judged': 'open-circle',
  waiting: 'clock',
};

const wordOf: Readonly<Record<CountKind, string>> = {
  supported: 'supported',
  rejected: 'rejected',
  'citation-invalid': 'citation invalid',
  unverified: 'unverified',
  'not-judged': 'not judged',
  waiting: 'waiting',
};

function marksOf(summary: CardSummary): readonly Mark[] {
  if (summary.kind === 'waiting') return [{ kind: 'waiting', text: 'waiting' }];
  if (summary.kind === 'all-supported') return [{ kind: 'supported', text: 'all supported' }];
  return summary.parts.map((part) => ({
    kind: part.kind,
    text: `${String(part.count)} ${wordOf[part.kind]}`,
  }));
}

function CardRow({ card }: { readonly card: CardView }): JSX.Element {
  return (
    <li class="rst-cardrow" data-testid="card-row">
      <span class="rst-cardrow__type">{card.type}</span>
      <span class="rst-cardrow__title">
        <span class="rst-mono rst-cardrow__id">{card.cardId}</span>{' '}
        <RenderedText text={card.title} />
      </span>
      <span class="rst-cardrow__chip" data-testid="card-counts">
        {marksOf(card.summary).map((mark, index) => (
          <Fragment key={mark.kind}>
            {index === 0 ? null : ' · '}
            <span class={`rst-cardrow__count rst-cardrow__count--${mark.kind}`}>
              <Glyph name={glyphOf[mark.kind]} />
              {mark.text}
            </span>
          </Fragment>
        ))}
      </span>
    </li>
  );
}

// RF-1015
export function CardsTab(props: {
  readonly state: RunState;
  readonly claims: readonly ClaimRow[];
  readonly source: SourceState | undefined;
}): JSX.Element {
  const cards = cardViewsOf(props.state);
  return (
    <>
      {cards.length === 0 ? (
        <p class="rst-settings__note">No cards yet. They appear here as the agents write them.</p>
      ) : (
        <ul class="rst-cardrows" aria-label="Cards so far">
          {cards.map((card) => (
            <CardRow key={card.cardId} card={card} />
          ))}
        </ul>
      )}
      <ClaimsList
        claims={props.claims}
        source={props.source}
        pending={judgementPending(props.state)}
      />
    </>
  );
}
