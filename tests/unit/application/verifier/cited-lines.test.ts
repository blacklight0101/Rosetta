import { describe, expect, it } from 'vitest';
import {
  JUDGEMENT_MARGIN_LINES,
  readCitedLines,
} from '../../../../src/application/verifier/cited-lines.js';
import { MemoryRepositoryReader } from '../../../support/memory-repository-reader.js';

// RF-301, ADR-005: the verifier sees the cited lines and a small margin, and nothing else of the file.

const file = Array.from({ length: 30 }, (_, index) => `line ${String(index + 1)}`).join('\n');
const limits = { maxLines: 400, maxChars: 40_000 };

function linesFrom(first: number, last: number): string[] {
  return Array.from({ length: last - first + 1 }, (_, index) => `line ${String(first + index)}`);
}

describe('cited lines', () => {
  it('RF-301 a citation is read with the margin before and after it, and no other line', async () => {
    const reader = new MemoryRepositoryReader({ 'src/A.cs': file });
    const citation = { path: 'src/A.cs', startLine: 10, endLine: 12 };

    const read = await readCitedLines(reader, [citation], limits);

    expect(JUDGEMENT_MARGIN_LINES).toBe(3);
    expect(read).toEqual({
      ok: true,
      value: [{ path: 'src/A.cs', startLine: 7, endLine: 15, lines: linesFrom(7, 15) }],
    });
  });

  it('RF-301 the margin stops at the first and the last line of the file', async () => {
    const reader = new MemoryRepositoryReader({ 'src/A.cs': file });
    const citations = [
      { path: 'src/A.cs', startLine: 1, endLine: 2 },
      { path: 'src/A.cs', startLine: 29, endLine: 30 },
    ];

    const read = await readCitedLines(reader, citations, limits);

    expect(read).toMatchObject({
      ok: true,
      value: [
        { startLine: 1, endLine: 5, lines: linesFrom(1, 5) },
        { startLine: 26, endLine: 30, lines: linesFrom(26, 30) },
      ],
    });
  });
});

describe('cited lines: limits and refusals', () => {
  it('RF-301 evidence longer than the line limit is not read and says why', async () => {
    const reader = new MemoryRepositoryReader({ 'src/A.cs': file });
    const citation = { path: 'src/A.cs', startLine: 5, endLine: 25 };

    const read = await readCitedLines(reader, [citation], { maxLines: 20, maxChars: 40_000 });

    expect(read).toEqual({
      ok: false,
      error: 'The cited lines are too long to judge in one call (27 lines, at most 20).',
    });
    expect(reader.reads).toEqual([]);
  });

  it('RF-301 evidence longer than the character limit is refused', async () => {
    const reader = new MemoryRepositoryReader({ 'src/A.cs': file });
    const citation = { path: 'src/A.cs', startLine: 5, endLine: 6 };

    const read = await readCitedLines(reader, [citation], { maxLines: 400, maxChars: 20 });

    expect(read).toEqual({
      ok: false,
      error: 'The cited lines are too long to judge in one call (55 characters, at most 20).',
    });
  });
});

describe('cited lines: ranges', () => {
  it.each([
    ['reversed', 9, 5],
    ['negative', -3, 2],
    ['zero-start', 0, 2],
    ['not whole', 2.5, 4],
  ])(
    'ADR-013 a %s range is refused before the margin is added, and nothing is read',
    async (_name, startLine, endLine) => {
      const reader = new MemoryRepositoryReader({ 'src/A.cs': file });
      const citation = { path: 'src/A.cs', startLine, endLine };

      const read = await readCitedLines(reader, [citation], limits);

      expect(read).toEqual({
        ok: false,
        error: `The cited range src/A.cs:${String(startLine)}-${String(endLine)} is not a range of lines.`,
      });
      expect(reader.reads).toEqual([]);
    },
  );

  it('RF-301 a file the reader refuses gives the refusal, never other content', async () => {
    const reader = new MemoryRepositoryReader({ 'src/A.cs': file });
    const citation = { path: 'src/Gone.cs', startLine: 1, endLine: 2 };

    const read = await readCitedLines(reader, [citation], limits);

    expect(read).toMatchObject({ ok: false });
    expect(read.ok ? '' : read.error).toMatch(/^The cited lines could not be read: /u);
  });
});
