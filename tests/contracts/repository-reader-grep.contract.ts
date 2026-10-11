import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import {
  refusalOf,
  securityCodes,
  type NewReader,
  type ReaderFixture,
} from '../support/reader-harness.js';

const fixture: ReaderFixture = {
  files: {
    'src/order.ts': 'const total = 1;\nfunction placeOrder() {}\n',
    'src/cart.ts': 'function addToCart() {}\nfunction placeOrder() {}\n',
    'docs/orders.md': 'placeOrder is the entry point\n',
    'secrets/notes.md': 'placeOrder secret notes\n',
    '.env': 'placeOrder FAKE\n',
  },
  ignoreRules: 'secrets/\n',
};

function matchingTests(newReader: NewReader): void {
  it('RF-146 grep returns every matching line sorted by path and line, never from ignored or denied files', async () => {
    const { reader } = await newReader(fixture);

    expect(await reader.grep({ pattern: 'place[A-Z]' })).toEqual({
      ok: true,
      value: {
        cutLines: 0,
        matches: [
          { path: 'docs/orders.md', line: 1, text: 'placeOrder is the entry point', cut: false },
          { path: 'src/cart.ts', line: 2, text: 'function placeOrder() {}', cut: false },
          { path: 'src/order.ts', line: 2, text: 'function placeOrder() {}', cut: false },
        ],
      },
    });
  });

  it('RF-146 a path pattern limits the files searched', async () => {
    const { reader } = await newReader(fixture);
    const result = await reader.grep({ pattern: 'placeOrder', pathGlob: '*.ts' });

    expect(result.ok && result.value.matches.map((match) => match.path)).toEqual([
      'src/cart.ts',
      'src/order.ts',
    ]);
  });

  it('RF-146 a pattern that is not a regular expression is refused with a reason', async () => {
    const { reader } = await newReader(fixture);

    expect(refusalOf(await reader.grep({ pattern: '(unclosed' }))).toMatchObject({
      code: ERROR_CODES.grepPatternInvalid,
      reason: 'invalid-pattern',
    });
  });
}

function limitTests(newReader: NewReader): void {
  it('RF-146 a pattern longer than 200 characters is refused with a reason the agent sees', async () => {
    const { reader, logger } = await newReader(fixture);
    const refusal = refusalOf(await reader.grep({ pattern: 'a'.repeat(201) }));

    expect(refusal).toMatchObject({
      code: ERROR_CODES.grepPatternTooLong,
      reason: 'pattern-too-long',
    });
    expect(refusal?.message).toContain('200');
    expect(securityCodes(logger)).toEqual([ERROR_CODES.grepPatternTooLong]);
  });

  it('RF-146 a pattern of exactly 200 characters runs', async () => {
    const { reader } = await newReader(fixture);

    expect(await reader.grep({ pattern: 'x'.repeat(200) })).toMatchObject({ ok: true });
  });

  it('RF-146 a line longer than 2,000 characters is cut before the search, with a notice', async () => {
    const long = `${'a'.repeat(1990)}needle${'b'.repeat(10)}needle-after-the-cut`;
    const { reader } = await newReader({ files: { 'big.txt': `${long}\nshort needle\n` } });
    const result = await reader.grep({ pattern: 'needle' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matches).toEqual([
      { path: 'big.txt', line: 1, text: long.slice(0, 2000), cut: true },
      { path: 'big.txt', line: 2, text: 'short needle', cut: false },
    ]);
    expect(result.value.cutLines).toBe(1);
    expect(result.value.notice).toContain('2000');
  });

  it('RF-146 text beyond the cut is never searched', async () => {
    const long = `${'a'.repeat(2000)}needle`;
    const { reader } = await newReader({ files: { 'big.txt': `${long}\n` } });

    expect(await reader.grep({ pattern: 'needle' })).toMatchObject({
      ok: true,
      value: { matches: [], cutLines: 1 },
    });
  });
}

/** The grep part of the RepositoryReader contract (RF-146). */
export function grepContract(newReader: NewReader): void {
  matchingTests(newReader);
  limitTests(newReader);
}
