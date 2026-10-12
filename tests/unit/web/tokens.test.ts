import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Vitest runs from the repository root.
const read = async (path: string): Promise<string> =>
  await readFile(resolve(process.cwd(), path), 'utf8');
const designTokens = await read('docs/design/tokens.css');
const webTokens = await read('web/src/styles/tokens.css');

// design-system.md sections 2 and 13: the web copy of the token file equals the design copy.

describe('RNF-010 design tokens', () => {
  it('RNF-010 web/src/styles/tokens.css is identical to docs/design/tokens.css', () => {
    expect(webTokens).toBe(designTokens);
  });

  it.each(['--rst-bg', '--rst-ink', '--rst-brand', '--rst-focus', '--rst-sp-4', '--rst-fs-md'])(
    'RNF-010 the token %s is defined for the page',
    (token) => {
      expect(webTokens).toContain(`${token}:`);
    },
  );

  it('RNF-010 both themes define the semantic colours the components read', () => {
    const dark = webTokens.slice(webTokens.indexOf('[data-theme="dark"]'));
    for (const tone of ['ok', 'warn', 'danger', 'info', 'neutral']) {
      expect(webTokens).toContain(`--rst-${tone}-solid-ink:`);
      expect(dark).toContain(`--rst-${tone}-bg:`);
    }
  });
});
