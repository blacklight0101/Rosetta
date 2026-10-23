import type { JSX } from 'preact';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import { areaLabel } from '../lib/live-run/area-label.js';
import { cardsText, type Tile, type TileState } from '../lib/live-run/code-map-tiles.js';

// RF-1016, DEC-137, design-system.md section 5 (living code map): the areas of the code as tiles
// sized by their estimated tokens. A tile says its state in words and a glyph: waiting, being read
// (a moving highlight, still under reduced motion), read with one mark per card, not covered, or
// library code left out (hatched). A tile opens its agent and cards. Names come from the repository
// and are shown as text: the part after the last "/" (`#1` reads "part 1"), the full name over the
// tile on hover and focus, in the title and in the name a screen reader says. The sub-line wraps.

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
  const cards = tile.cards === 0 ? '' : ` · ${cardsText(tile)}`;
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

/** What a screen reader says for a tile: the full name (and what a part is), then the state. */
function nameOf(tile: Tile): string {
  const label = areaLabel(tile.name);
  const part =
    label.part === undefined
      ? ''
      : `: part ${String(label.part)} of an area too large for one agent`;
  return `${label.full}${part}, ${metaOf(tile)}`;
}

function TileFace({ tile }: { readonly tile: Tile }): JSX.Element {
  const label = areaLabel(tile.name);
  return (
    <>
      <span class="rst-tile__name" title={label.full}>
        {label.text}
      </span>
      {label.text === label.full ? null : (
        <span class="rst-tile__full" aria-hidden="true">
          {label.full}
        </span>
      )}
      <span class="rst-tile__meta">
        <Glyph name={glyphOf[tile.state]} />
        <span class="rst-tile__words">{metaOf(tile)}</span>
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
          aria-label={nameOf(tile)}
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
