import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { refusalOf, type NewReader, type ReaderFixture } from '../support/reader-harness.js';

// RF-140, RF-146, P1-90: the part of the RepositoryReader contract that the in-memory test double
// must answer exactly like the file reader, so the agent-tool tests built on it stay faithful.

const fixture: ReaderFixture = {
  files: {
    'README.md': 'one\ntwo\nthree\n',
    'src/main.ts': 'first\r\nsecond\r\nthird',
    'src/order.ts': 'function placeOrder() {}\n',
    'src/cart.ts': 'function placeOrder() {}\n',
  },
};

function rangeTests(newReader: NewReader): void {
  it('RF-140 a read that starts past the end of the file is refused as an invalid range', async () => {
    const { reader } = await newReader(fixture);
    const result = await reader.readLines({ path: 'README.md', startLine: 4, endLine: 9 });

    expect(refusalOf(result)).toEqual({
      code: ERROR_CODES.lineRangeInvalid,
      reason: 'invalid-range',
      message:
        'Lines are 1-based whole numbers; the start must not be after the end or past the last line.',
    });
  });

  it('RF-140 a final line break does not count as one more line', async () => {
    const { reader } = await newReader(fixture);

    expect(await reader.readLines({ path: 'README.md', startLine: 1, endLine: 99 })).toEqual({
      ok: true,
      value: {
        path: 'README.md',
        startLine: 1,
        endLine: 3,
        totalLines: 3,
        lines: ['one', 'two', 'three'],
      },
    });
  });

  it('RF-140 Windows line endings are not part of the lines', async () => {
    const { reader } = await newReader(fixture);

    expect(await reader.readLines({ path: 'src/main.ts', startLine: 1, endLine: 3 })).toMatchObject(
      { ok: true, value: { totalLines: 3, lines: ['first', 'second', 'third'] } },
    );
  });
}

function grepPathTests(newReader: NewReader): void {
  it('RF-146 grep with a path list searches only those files', async () => {
    const { reader } = await newReader(fixture);

    expect(await reader.grep({ pattern: 'placeOrder', paths: ['src/cart.ts'] })).toEqual({
      ok: true,
      value: {
        cutLines: 0,
        matches: [{ path: 'src/cart.ts', line: 1, text: 'function placeOrder() {}', cut: false }],
      },
    });
  });

  it('RF-146 grep with an empty path list searches nothing', async () => {
    const { reader } = await newReader(fixture);

    expect(await reader.grep({ pattern: 'placeOrder', paths: [] })).toMatchObject({
      ok: true,
      value: { matches: [] },
    });
  });
}

/** What the in-memory reader and the file reader must answer alike (P1-90). */
export function mirrorContract(newReader: NewReader): void {
  rangeTests(newReader);
  grepPathTests(newReader);
}
