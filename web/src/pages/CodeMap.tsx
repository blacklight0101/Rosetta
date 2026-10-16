import type { JSX } from 'preact';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import type { Tile, TileState } from '../lib/live-run/code-map-tiles.js';

// RF-1016, DEC-137, design-system.md section 5 (living code map): the areas of the code as tiles
// sized by their estimated tokens. A tile says its state in words and a glyph: waiting, being read
// (a moving highlight, still under reduced motion), read with one mark per card, not covered, or
// library code left out (hatched). A tile opens its agent and cards. Names come from the repository
// and are shown as text; a long one is cut with an ellipsis and keeps its full text in a title.

export interface CodeMapProps {
  readonly tiles: readonly Tile[];
  readonly stage: string;
  readonly onOpenArea: (name: string) => void;
}

const glyphOf: Readonly<Record<TileState, GlyphName>> = {
  waiting: 'dashed-circle',
  reading: 'live-dot',
  done: 'check',
  gap: 'exclamation',
  library: 'brackets',
};

const legend: readonly (readonly [TileState, string])[] = [
  ['reading', 'being read'],
  ['done', 'read'],
  ['waiting', 'waiting'],
  ['gap', 'not covered'],
  ['library', 'library, left out'],
];

/** More marks than this are not drawn; the tile still says the number of cards. */
const MAX_PIPS = 24;

const count = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

function metaOf(tile: Tile): string {
  const files = count(tile.filesRead, 'file', 'files');
  const cards = tile.cards === 0 ? '' : ` · ${count(tile.cards, 'card', 'cards')}`;
  switch (tile.state) {
    case 'library':
      return 'library, left out';
    case 'gap':
      return `not covered${cards}`;
    case 'waiting':
      return 'waiting';
    case 'reading':
      return `being read · ${files}${cards}`;
    case 'done':
      return `read · ${files}${cards}`;
  }
}

function Pips({ cards }: { readonly cards: number }): JSX.Element {
  return (
    <span class="rst-tile__pips" aria-hidden="true">
      {Array.from({ length: Math.min(cards, MAX_PIPS) }, (_, index) => (
        <span key={index} class="rst-tile__pip" />
      ))}
    </span>
  );
}

function TileFace({ tile }: { readonly tile: Tile }): JSX.Element {
  return (
    <>
      <span class="rst-tile__name" title={tile.name}>
        {tile.name}
      </span>
      <span class="rst-tile__meta">
        <Glyph name={glyphOf[tile.state]} />
        {metaOf(tile)}
      </span>
      {tile.rows > 1 && tile.cards > 0 ? <Pips cards={tile.cards} /> : null}
      {tile.progress === undefined ? null : (
        <span class="rst-tile__fill" style={{ inlineSize: `${String(tile.progress)}%` }} />
      )}
    </>
  );
}

function Cell(props: {
  readonly tile: Tile;
  readonly onOpenArea: (name: string) => void;
}): JSX.Element {
  const { tile } = props;
  const cell = `rst-codemap__cell rst-codemap__cell--cols-${String(tile.columns)} rst-codemap__cell--rows-${String(tile.rows)}`;
  const face = `rst-tile rst-tile--${tile.state}${tile.rows === 1 ? ' rst-tile--short' : ''}`;
  return (
    <li class={cell} data-state={tile.state}>
      {tile.state === 'library' ? (
        <div class={face}>
          <TileFace tile={tile} />
        </div>
      ) : (
        <button
          type="button"
          class={face}
          onClick={() => {
            props.onOpenArea(tile.name);
          }}
        >
          <TileFace tile={tile} />
        </button>
      )}
    </li>
  );
}

function Legend(): JSX.Element {
  return (
    <ul class="rst-codemap__legend" aria-label="Legend">
      {legend.map(([state, words]) => (
        <li key={state} class="rst-codemap__key">
          <span class={`rst-codemap__swatch rst-codemap__swatch--${state}`} aria-hidden="true" />
          {words}
        </li>
      ))}
    </ul>
  );
}

function emptyNote(stage: string): string {
  return stage === 'scan'
    ? 'The areas appear when the scan has finished.'
    : 'The areas appear when the run plans its work.';
}

// RF-1016
export function CodeMap({ tiles, stage, onOpenArea }: CodeMapProps): JSX.Element {
  return (
    <section class="rst-card rst-codemap-panel" aria-labelledby="rst-codemap-title">
      <header class="rst-codemap-panel__head">
        <h2 id="rst-codemap-title" class="rst-codemap-panel__title">
          The code, area by area
        </h2>
        <Legend />
      </header>
      {tiles.length === 0 ? (
        <p class="rst-settings__note">{emptyNote(stage)}</p>
      ) : (
        <ul class="rst-codemap" aria-label="Areas of the code">
          {tiles.map((tile) => (
            <Cell key={tile.name} tile={tile} onOpenArea={onOpenArea} />
          ))}
        </ul>
      )}
    </section>
  );
}
