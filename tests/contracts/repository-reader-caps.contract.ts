import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import {
  cutNotice,
  matchCapNotice,
  tooLargeNotice,
} from '../../src/infrastructure/files/read-refusals.js';
import {
  refusalOf,
  securityCodes,
  type NewReader,
  type ReaderFixture,
} from '../support/reader-harness.js';

// RF-144, RF-146, P1-67: one read or one search cannot hand a huge file or an unbounded list of
// matches to an agent. Files above `scan.maxFileBytes` are refused; grep stops at its match cap.

const fixture: ReaderFixture = {
  files: {
    'big.txt': `${'x'.repeat(1990)}needle\n`,
    'exact.txt': `${'y'.repeat(993)}needle\n`,
    'small.txt': 'needle\n',
  },
  maxFileBytes: 1000,
};

function lines(count: number, text: string): string {
  return `${text}\n`.repeat(count);
}

function readCapTests(newReader: NewReader): void {
  it('RF-144 a file larger than scan.maxFileBytes is refused with a reason the agent sees', async () => {
    const { reader, logger } = await newReader(fixture);
    const refusal = refusalOf(
      await reader.readLines({ path: 'big.txt', startLine: 1, endLine: 1 }),
    );

    expect(refusal).toMatchObject({ code: ERROR_CODES.fileTooLarge, reason: 'too-large' });
    expect(refusal?.message).toContain('scan.maxFileBytes');
    expect(securityCodes(logger)).toEqual([]);
  });

  it('RF-144 a file of exactly scan.maxFileBytes is read', async () => {
    const { reader } = await newReader(fixture);

    expect(await reader.readLines({ path: 'exact.txt', startLine: 1, endLine: 1 })).toMatchObject({
      ok: true,
      value: { totalLines: 1, lines: [`${'y'.repeat(993)}needle`] },
    });
  });

  it('RF-144 a 10 MB line is not returned whole under the default limit', async () => {
    const { reader } = await newReader({
      files: { 'huge.txt': `${'a'.repeat(10 * 1024 * 1024)}\n` },
    });
    const result = await reader.readLines({ path: 'huge.txt', startLine: 1, endLine: 1 });

    expect(result.ok).toBe(false);
    expect(refusalOf(result)?.reason).toBe('too-large');
  });
}

function grepSizeTests(newReader: NewReader): void {
  it('RF-146 grep leaves out a file larger than scan.maxFileBytes, with a notice', async () => {
    const { reader } = await newReader(fixture);
    const result = await reader.grep({ pattern: 'needle' });

    expect(result.ok && result.value.matches.map((match) => match.path)).toEqual([
      'exact.txt',
      'small.txt',
    ]);
    expect(result.ok && result.value.cutLines).toBe(0);
    expect(result.ok && result.value.notice).toContain('scan.maxFileBytes');
  });
}

function grepMatchCapTests(newReader: NewReader): void {
  it('RF-146 a pattern that matches every line returns at most 1000 matches, with a notice', async () => {
    const { reader } = await newReader({
      files: { 'a.txt': lines(600, 'row'), 'b.txt': lines(600, 'row') },
    });
    const result = await reader.grep({ pattern: '' });

    expect(result.ok && result.value.matches.length).toBe(1000);
    expect(result.ok && result.value.matches.at(-1)).toMatchObject({ path: 'b.txt', line: 400 });
    expect(result.ok && result.value.notice).toContain('1000');
  });

  it('RF-146 exactly 1000 matches are all returned without a notice', async () => {
    const { reader } = await newReader({ files: { 'a.txt': lines(1000, 'row') } });
    const result = await reader.grep({ pattern: 'row' });

    expect(result.ok && result.value.matches.length).toBe(1000);
    expect(result.ok && result.value.notice).toBeUndefined();
  });
}

// P1-127: both readers build the notice with the same builder, so the agent reads the same text
// whichever reader runs; a reader with its own wording fails here.
function grepNoticeTests(newReader: NewReader): void {
  it('RF-146 the notice for a cut line is the shared cut notice', async () => {
    const { reader } = await newReader({ files: { 'long.txt': `${'a'.repeat(2001)}\nneedle\n` } });
    const result = await reader.grep({ pattern: 'needle' });

    expect(result.ok && result.value.cutLines).toBe(1);
    expect(result.ok && result.value.notice).toBe(cutNotice);
    expect(cutNotice).toContain('2000');
  });

  it('RF-146 cut lines, big files and the match cap are told in one notice, in that order', async () => {
    const { reader } = await newReader({
      files: {
        'a.txt': `${'r'.repeat(2001)}\n${lines(1000, 'row')}`,
        'big.txt': lines(2000, 'row'),
      },
      maxFileBytes: 2002 + 4000,
    });
    const result = await reader.grep({ pattern: 'r' });

    expect(result.ok && result.value.notice).toBe(
      [cutNotice, tooLargeNotice(1), matchCapNotice].join(' '),
    );
  });
}

/** The size caps of the RepositoryReader contract (RF-144, RF-146). */
export function capsContract(newReader: NewReader): void {
  readCapTests(newReader);
  grepSizeTests(newReader);
  grepMatchCapTests(newReader);
  grepNoticeTests(newReader);
}
