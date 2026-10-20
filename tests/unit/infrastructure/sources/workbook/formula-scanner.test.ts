import { expect, it } from 'vitest';
import {
  MAX_FORMULA_CHARS,
  Scanner,
} from '../../../../../src/infrastructure/sources/workbook/formula-scanner.js';

// RF-153: every read of the scanner is capped, so a formula cannot make one token cost its length
// again and again.

it('RF-153 reads a bracket group up to 1,000 characters when it is never closed', () => {
  const scanner = new Scanner('['.repeat(5000));
  const group = scanner.readBracket();
  expect(group.length).toBe(1000);
  expect(scanner.pos).toBe(1000);
});

it("RF-153 reads a bracket group with an escaped bracket ('[ and ']) as one group", () => {
  const scanner = new Scanner("[Name '[x']]+1");
  expect(scanner.readBracket()).toBe("[Name '[x']]");
});

it('RF-153 gives up on a quoted name longer than a name can be, and moves past it', () => {
  const scanner = new Scanner(`'${'a'.repeat(3000)}'!A1`);
  expect(scanner.readQuoted()).toBeUndefined();
  expect(scanner.peek()).toBe('!');
});

it('RF-153 reads a doubled quote in a quoted name as one quote', () => {
  const scanner = new Scanner("'It''s'!A1");
  expect(scanner.readQuoted()).toBe("It's");
});

it('RF-153 keeps 255 characters of a word and consumes the rest of it', () => {
  const scanner = new Scanner(`${'A'.repeat(30_000)}+1`);
  expect(scanner.readWord()).toHaveLength(255);
  expect(scanner.peek()).toBe('+');
});

it('RF-153 reads no more than the first 32,768 characters of a formula', () => {
  const scanner = new Scanner('1'.repeat(MAX_FORMULA_CHARS + 10));
  expect(scanner.text).toHaveLength(MAX_FORMULA_CHARS);
  expect(scanner.cut).toBe(true);
});

it('RF-153 skips a string with a doubled quote and one that is never closed', () => {
  const closed = new Scanner('"a""b"+A1');
  closed.skipString();
  expect(closed.peek()).toBe('+');
  const open = new Scanner('"abc');
  open.skipString();
  expect(open.atEnd).toBe(true);
});
