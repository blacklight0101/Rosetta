import type { CodeMap } from '../../domain/code-map/code-map.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import { legacyStackOf } from '../../domain/planning/legacy-stack.js';

// RF-608, RF-609, RF-145, ADR-013, ADR-018: what the planner is given. The six styles with their
// selection criteria go into the system prompt, because they are Rosetta's own text (the catalogue
// is versioned, DEC-84). The verified cards and what the scan found of the legacy stack go into the
// user message as two data blocks, because both were written about, or taken from, someone else's
// code; the prompt tells the planner they are data.

/** The place in `planner/options.v1.md` where the styles are written; it must appear once. */
export const STYLES_PLACEHOLDER = '{{styles}}';

/** The styles of the catalogue with when to choose each and when to look elsewhere. */
// RF-608
export function stylesText(catalogue: Catalogue): string {
  return catalogue.styles
    .map((style) =>
      [
        `- ${style.id} (${style.title}): ${style.rule}`,
        `  Choose it when: ${style.chooseWhen.join('; ')}`,
        `  Look elsewhere when: ${style.avoidWhen.join('; ')}`,
      ].join('\n'),
    )
    .join('\n');
}

/** The system prompt: the prompt file with the styles written in. */
// RF-608
export function plannerSystem(prompt: string, catalogue: Catalogue): string {
  return prompt.replace(STYLES_PLACEHOLDER, () => stylesText(catalogue));
}

function cardsBlock(cards: readonly SourceCard[], tag: string): string {
  const listed = cards.map(({ id, type, area, title, summary, claims }) => ({
    id,
    type,
    area,
    title,
    summary,
    claims: claims.map((claim) => claim.text),
  }));
  return renderDataBlock(
    { source: 'cards', excerpts: [], text: JSON.stringify(listed, null, 2) },
    tag,
  );
}

function scanBlock(map: CodeMap, tag: string): string {
  const totals = {
    files: map.files.length,
    areas: map.areas.length,
    symbols: map.symbols.length,
    links: map.links.length,
    sqlStatements: map.sqlStatements.length,
    entities: map.entities.length,
  };
  const text = JSON.stringify({ ...legacyStackOf(map), totals }, null, 2);
  return renderDataBlock({ source: 'scan_summary', excerpts: [], text }, tag);
}

/** The user message: the verified cards, then the legacy stack, each in a block with its own tag. */
// RF-608, RF-609
export function planOptionsMessage(
  input: { readonly cards: readonly SourceCard[]; readonly codeMap: CodeMap },
  tags: { readonly cards: string; readonly scan: string },
): string {
  return `${cardsBlock(input.cards, tags.cards)}\n\n${scanBlock(input.codeMap, tags.scan)}`;
}
