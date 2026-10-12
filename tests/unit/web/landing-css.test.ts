import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// RF-1200, RNF-010, design-system.md sections 2 and 14: the landing page works without JavaScript,
// so it cannot set `data-theme`; its style sheet follows `prefers-color-scheme` with the same dark
// tokens as tokens.css, and the replay stage follows the motion rules of the design system.

const read = async (path: string): Promise<string> =>
  await readFile(resolve(process.cwd(), path), 'utf8');
const tokens = await read('web/src/styles/tokens.css');
const landing = await read('web/src/landing/landing.css');

/** The text between the braces that follow `opening`, braces balanced. */
function blockAfter(source: string, opening: string): string {
  const start = source.indexOf(opening);
  if (start < 0) return '';
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(source.indexOf('{', start) + 1, i);
  }
  return '';
}

const declarations = (block: string): string[] =>
  [...block.matchAll(/(--rst-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) =>
    `${match[1] ?? ''}: ${(match[2] ?? '').trim()}`.toLowerCase(),
  );

describe('landing style sheet', () => {
  it('RNF-010 starts from the design tokens', () => {
    expect(landing).toMatch(/@import\s+["']\.\.\/styles\/tokens\.css["']/);
  });

  it('RNF-010 repeats every dark token under prefers-color-scheme, with the same value', () => {
    const dark = declarations(blockAfter(tokens, '[data-theme="dark"]'));
    const media = declarations(blockAfter(landing, '@media (prefers-color-scheme: dark)'));

    expect(dark.length).toBeGreaterThan(30);
    expect(media).toEqual(dark);
  });

  it('RF-1200 plays the replay once per 10 s cycle and pauses it on hover or focus', () => {
    expect(landing).toMatch(/animation:[^;]*\b10s\b/);
    expect(landing).toMatch(/\.stage:hover[^{]*\{[^}]*animation-play-state:\s*paused/);
    expect(landing).toMatch(/\.stage:focus-within[^{]*\{[^}]*animation-play-state:\s*paused/);
  });

  it('RF-1200 renders the replay finished and still under prefers-reduced-motion', () => {
    const reduced = blockAfter(landing, '@media (prefers-reduced-motion: reduce)');

    expect(reduced).toMatch(/animation:\s*none/);
    expect(reduced).toMatch(/\.swap-b[^{]*\{[^}]*opacity:\s*1/);
  });

  it('RF-1200 wraps at 360 px: the lanes, the rail and the page gutters have a narrow layout', () => {
    expect(landing).toMatch(/@media \(max-width:\s*600px\)/);
    expect(landing).toMatch(/@media \(max-width:\s*720px\)/);
  });

  it('RF-1013 uses no external URL and no custom font', () => {
    expect(landing).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//);
    expect(landing).not.toContain('@font-face');
  });
});
