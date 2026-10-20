import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// RNF-010, RF-1016, design-system.md sections 5 and 14 (P3-62, owner test 2026-10-20): the style
// sheets of the run page. A sub-line is never cut with an ellipsis, a path breaks only where the
// markup offers a break, and a button styled as a link looks like a link.

const read = async (path: string): Promise<string> =>
  await readFile(resolve(process.cwd(), path), 'utf8');

const sheets = {
  map: await read('web/src/styles/live-run-map.css'),
  running: await read('web/src/styles/live-run-running.css'),
  run: await read('web/src/styles/live-run.css'),
  coverage: await read('web/src/styles/live-coverage.css'),
  components: await read('web/src/styles/components.css'),
};

/** The declarations of the first rule whose selector list contains `selector` exactly. */
function ruleOf(source: string, selector: string): string {
  const bare = source.replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
  const found = rules.find((rule) =>
    (rule[1] ?? '').split(',').some((each) => each.trim() === selector),
  );
  if (found === undefined) throw new Error(`no rule for ${selector}`);
  return found[2] ?? '';
}

describe('RF-1016 the sub-lines of the code map are not cut', () => {
  it.each(['.rst-tile__meta', '.rst-tile__words'])('RF-1016 %s wraps its words', (selector) => {
    const rule = ruleOf(sheets.map, selector);

    expect(rule).not.toContain('text-overflow');
    expect(rule).not.toContain('nowrap');
  });

  it('RF-1016 lets a tile grow to hold its words', () => {
    expect(ruleOf(sheets.map, '.rst-codemap')).toMatch(/grid-auto-rows:\s*minmax\(56px,\s*auto\)/u);
  });

  it('RF-1016 shows the full name of an area on hover and on keyboard focus', () => {
    expect(sheets.map).toMatch(/\.rst-tile:hover \.rst-tile__full[^{]*\{[^}]*display:\s*block/u);
    expect(sheets.map).toMatch(
      /\.rst-tile:focus-visible \.rst-tile__full[^{]*\{[^}]*display:\s*block/u,
    );
    expect(ruleOf(sheets.map, '.rst-tile__full')).toContain('display: none');
  });
});

describe('RF-1015 the sub-lines of the run journey are not cut', () => {
  it('RF-1015 the detail of a step wraps', () => {
    const rule = ruleOf(sheets.running, '.rst-journey__detail');

    expect(rule).not.toContain('text-overflow');
    expect(rule).not.toContain('nowrap');
  });
});

describe('RNF-010 paths break at the places the markup offers', () => {
  it.each([
    ['run', '.rst-live-panel__area'],
    ['run', '.rst-live-panel__now'],
    ['run', '.rst-live-claim__lines'],
    ['run', '.rst-live-log__text'],
    ['coverage', '.rst-p138-name'],
    ['coverage', '.rst-p138-area-name'],
  ] as const)('RNF-010 %s sheet: %s does not break inside a word', (sheet, selector) => {
    const rule = ruleOf(sheets[sheet], selector);

    expect(rule).toContain('overflow-wrap: break-word');
    expect(rule).not.toContain('anywhere');
  });
});

describe('RNF-010 a button that looks like a link', () => {
  it('RNF-010 is underlined, in the colour of a link, and has no box', () => {
    const rule = ruleOf(sheets.components, '.rst-root .rst-button--link');

    expect(rule).toContain('text-decoration: underline');
    expect(rule).toContain('color: var(--rst-brand)');
    expect(rule).toContain('min-height: 0');
  });
});
