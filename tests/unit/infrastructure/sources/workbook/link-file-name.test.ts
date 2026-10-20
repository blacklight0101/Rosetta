import { expect, it } from 'vitest';
import { linkFileName } from '../../../../../src/infrastructure/sources/workbook/link-file-name.js';

// RF-153, Q-38: the file name of an external link, whatever way the target is percent-encoded, even
// with the hex digits of an escape spelled as escapes themselves, or with a stray `%`.

const TOKEN = ['TO', 'K'].join('');
const SPECIAL = new Set(['?', '#', '/', String.fromCharCode(92), '@', ';']);

it.each([
  [`Book.xlsx%25%33Ftoken=${TOKEN}`, 'Book.xlsx'],
  [`Book.xlsx%253%46token=${TOKEN}`, 'Book.xlsx'],
  [`Book.xlsx%%33Ftoken=${TOKEN}`, 'Book.xlsx'],
  ['C:%25%35CUsers%25%35Cbob%25%35CBook.xlsx', 'Book.xlsx'],
  ['a%25%32Fb%25%32Fbook.xlsx', 'book.xlsx'],
  [`https:%2F%2Fuser:${TOKEN}@host`, ''],
  [`user:${TOKEN}@host`, ''],
  [`https://${TOKEN}@host`, ''],
  [`Book.xlsx;jsessionid=${TOKEN}`, 'Book.xlsx'],
  [`Book.xlsx%3Bjsessionid=${TOKEN}`, 'Book.xlsx'],
  [String.raw`C:\dir;x\Book.xlsx`, 'Book.xlsx'],
  ['My%20Prices.xlsx', 'My Prices.xlsx'],
  ['Bad%E0%A4%A.xlsx', ''],
])('Q-38 reads the file name of %s as "%s"', (target, expected) => {
  expect(linkFileName(target)).toBe(expected);
});

/** Small deterministic generator, so a failure repeats. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function encodeOnce(text: string, next: () => number): string {
  let out = '';
  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at);
    const inEscape = /%[0-9a-f]?$/iu.test(text.slice(Math.max(0, at - 2), at));
    const spelled = char !== '%' && (SPECIAL.has(char) || (inEscape && next() < 0.5));
    if (char === '%') out += '%25';
    else if (spelled) {
      const hex = char.charCodeAt(0).toString(16).padStart(2, '0');
      out += `%${next() < 0.5 ? hex.toUpperCase() : hex}`;
    } else out += char;
  }
  return out;
}

it('Q-38 keeps no query, folder, user information or token at any depth of spelled-out encoding', () => {
  const next = random(58);
  for (let round = 0; round < 400; round += 1) {
    const joiner = next() < 0.5 ? String.fromCharCode(92) : '/';
    const tail = ['?', '#', ';'][Math.floor(next() * 3)] ?? '?';
    let target = `user:${TOKEN}@host${joiner}bob${joiner}Book.xlsx${tail}x=${TOKEN}`;
    for (let depth = Math.floor(next() * 6) + 1; depth > 0; depth -= 1) {
      target = encodeOnce(target, next);
    }

    const name = linkFileName(target);

    expect(['', 'Book.xlsx']).toContain(name);
  }
});

it('Q-38 reads a 400,000-character target in linear time', () => {
  const targets = [
    `Book.xlsx${'%25'.repeat(133_333)}3F`,
    '%'.repeat(400_000),
    `${'%2525'.repeat(80_000)}Book.xlsx`,
  ];
  const started = performance.now();

  for (const target of targets) linkFileName(target);

  expect(performance.now() - started).toBeLessThan(3000);
});
