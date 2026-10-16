import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// RF-1016, RNF-010, design-system.md sections 2.6 and 14 (P1-169): the style sheet of the running
// page. Reduced motion stops every animation and transition of the code map, so states change in
// place; the sheet takes its colours from the tokens, never from literals.

const read = async (path: string): Promise<string> =>
  await readFile(resolve(process.cwd(), path), 'utf8');
const sheet = await read('web/src/styles/live-run-map.css');

/** The text between the braces that follow `opening`, braces balanced. */
function blockAfter(source: string, opening: string): string {
  const start = source.indexOf(opening);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, i);
  }
  return '';
}

describe('the style sheet of the running page', () => {
  const reduced = blockAfter(sheet, '@media (prefers-reduced-motion: reduce)');

  it('RF-1016 moves the highlight, the marks and the fill only when motion is allowed', () => {
    expect(sheet).toMatch(/\.rst-tile--reading::after\s*\{[^}]*animation:/u);
    expect(sheet).toMatch(/\.rst-tile__pip\s*\{[^}]*animation:/u);
    expect(sheet).toMatch(/\.rst-tile__fill\s*\{[^}]*transition:/u);
  });

  it('RF-1016 stops every animation and transition of the map under reduced motion', () => {
    expect(reduced).toMatch(/\.rst-tile--reading::after[^{]*\{[^}]*animation:\s*none/u);
    expect(reduced).toMatch(/\.rst-tile__pip[^{]*\{[^}]*animation:\s*none/u);
    expect(reduced).toMatch(/\.rst-tile__fill[^{]*\{[^}]*transition:\s*none/u);
    expect(reduced).toMatch(/\.rst-tile[,\s][^{]*\{[^}]*transition:\s*none/u);
    expect(reduced).toMatch(/\.rst-tile:hover[^{]*\{[^}]*transform:\s*none/u);
  });

  it('RF-1016 draws third-party areas hatched and dashed', () => {
    expect(sheet).toMatch(/\.rst-tile--library\s*\{[^}]*repeating-linear-gradient/u);
    expect(sheet).toMatch(/\.rst-tile--library\s*\{[^}]*dashed/u);
  });

  it('RNF-010 uses no colour literal', () => {
    expect(sheet).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(sheet).not.toMatch(/\brgba?\(/u);
  });

  it('RNF-010 lays the map out in two columns at 360 px', () => {
    const phone = blockAfter(sheet, '@media (max-width: 560px)');

    expect(phone).toMatch(/\.rst-codemap\s*\{[^}]*grid-template-columns:\s*repeat\(2/u);
  });
});
