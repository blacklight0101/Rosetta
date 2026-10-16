import type { JSX } from 'preact';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import { RenderedText } from '../components/RenderedText.js';
import { cardViewsOf, type CardView } from '../lib/live-run/card-checks.js';
import type { ClaimRow, RunState, SourceState } from '../lib/live-run/run-state.js';
import { ClaimsList } from './ClaimsList.js';

// RF-1004, RF-1014, RF-1015, DEC-137: the "Cards so far" tab: one row per card the agents wrote,
// with whether its citations were checked, then the claims with their status and cited lines (the
// verification view). Card titles and claim text come from a model and are shown as text.

const glyphOf: Readonly<Record<CardView['check'], GlyphName>> = {
  checked: 'check',
  invalid: 'warning-triangle',
  waiting: 'clock',
};

const wordOf: Readonly<Record<CardView['check'], string>> = {
  checked: 'citations checked',
  invalid: 'citation invalid',
  waiting: 'awaiting check',
};

function CardRow({ card }: { readonly card: CardView }): JSX.Element {
  return (
    <li class="rst-cardrow" data-testid="card-row">
      <span class="rst-cardrow__type">{card.type}</span>
      <span class="rst-cardrow__title">
        <span class="rst-mono rst-cardrow__id">{card.cardId}</span>{' '}
        <RenderedText text={card.title} />
      </span>
      <span class={`rst-cardrow__chip rst-cardrow__chip--${card.check}`}>
        <Glyph name={glyphOf[card.check]} />
        {wordOf[card.check]}
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
      <ClaimsList claims={props.claims} source={props.source} />
    </>
  );
}
