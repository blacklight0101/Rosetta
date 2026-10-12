import { describe, expect, it } from 'vitest';
import type { AreaCoverage } from '../../../../src/domain/cards/area-coverage.js';
import { writeCoverageOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardLogger, cardTarget, fileOf } from '../../../support/card-output-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-230, RF-507, ADR-013: file paths and area names come from the analysed repository, so
// `coverage.md` shows them as text: no live link, no extra table cell, no HTML, no heading.

const linkPath = 'a/[x](http://evil.test)|<b>.cs';
const htmlArea = '<img src=x onerror=1>\n# H';
const multilinePath = 'dir/new\nline `code`.cs';
const headingArea = '# Injected heading';
const pipeArea = 'left | right';

const hostile: AreaCoverage[] = [htmlArea, headingArea, pipeArea].map((area) => ({
  area,
  files: [
    { path: linkPath, read: [{ startLine: 1, endLine: 2 }] },
    { path: multilinePath, read: [] },
    { path: '# not a heading.cs', read: [] },
  ],
  tokens: 10,
  readTokens: 5,
  readTokenShare: 0.5,
}));

async function render(): Promise<{ writer: MemoryOutputWriter; markdown: string }> {
  const writer = new MemoryOutputWriter();
  const result = await writeCoverageOutputs(writer, cardTarget, {
    coverage: hostile,
    masker: new SecretMasker(),
    logger: cardLogger(),
  });
  expect(result.ok).toBe(true);
  return { writer, markdown: fileOf(writer, 'coverage.md') };
}

/** The cells of a table row, counting only `|` that no backslash escapes. */
function cellsOf(row: string): number {
  return row.replaceAll('\\|', '').split('|').length - 2;
}

describe('coverage.md with hostile paths and area names', () => {
  it('RF-230 RF-507 shows a path with link syntax, a pipe and HTML as inert text', async () => {
    const { markdown } = await render();

    expect(markdown).toContain('| a/\\[x\\]\\(http&#58;//evil.test\\)\\|&lt;b&gt;.cs | 1\\-2 |');
    expect(markdown).not.toContain('<');
    expect(markdown).not.toContain('](');
  });

  it('RF-230 RF-507 keeps a newline and backticks in a path on one row as escaped text', async () => {
    const { markdown } = await render();

    expect(markdown).toContain('| dir/new line \\`code\\`.cs | not read |');
  });

  it('RF-230 RF-507 shows an area name with HTML and a heading line as one escaped heading', async () => {
    const { markdown } = await render();

    expect(markdown).toContain('## Area: &lt;img src\\=x onerror\\=1&gt; \\# H');
    expect(markdown).toContain('| &lt;img src\\=x onerror\\=1&gt; \\# H | 1 of 3 | 50.0% |');
  });
});

describe('coverage.md structure with hostile paths and area names', () => {
  it('RF-230 RF-507 never lets a name start a heading of its own or break a table row', async () => {
    const { markdown } = await render();

    const lines = markdown.split('\n');
    const headings = lines.filter((line) => line.startsWith('#'));
    expect(headings.filter((line) => line.startsWith('## Area: '))).toHaveLength(hostile.length);
    expect(headings.filter((line) => !line.startsWith('## Area: '))).toEqual([
      '# Coverage',
      '## Run summary',
    ]);
    expect(markdown).toContain('| \\# not a heading.cs | not read |');
    expect(markdown).toContain('## Area: \\# Injected heading');
    expect(markdown).toContain('| left \\| right | 1 of 3 | 50.0% |');
    const rows = lines.filter((line) => line.startsWith('|'));
    const fileRows = rows.filter((row) => row.includes('evil.test'));
    expect(fileRows).toHaveLength(hostile.length);
    expect(fileRows.every((row) => cellsOf(row) === 2)).toBe(true);
    expect(rows.every((row) => [2, 3].includes(cellsOf(row)))).toBe(true);
  });

  it('RF-230 keeps the original strings in coverage.json', async () => {
    const { writer } = await render();

    const json = fileOf(writer, 'coverage.json');
    expect(json).toContain(JSON.stringify(linkPath));
    expect(json).toContain(JSON.stringify(multilinePath));
    expect(json).toContain(JSON.stringify(htmlArea));
  });
});
