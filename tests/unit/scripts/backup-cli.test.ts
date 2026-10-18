import { describe, expect, it } from 'vitest';
import { parseFlags, parseTableCount } from '../../../scripts/backup/cli.js';

describe('restore flags', () => {
  it('RF-1306 reads the options of a restore', () => {
    expect(parseFlags(['--dump', 'a.dump', '--data-target', 'out', '--force'])).toEqual({
      dump: 'a.dump',
      dataCopy: undefined,
      dataTarget: 'out',
      force: true,
    });
    expect(parseFlags([])).toMatchObject({ force: false, dump: undefined });
  });

  it('RF-1306 never takes a flag as the value of another flag', () => {
    expect(() => parseFlags(['--dump', '--force'])).toThrow(/--dump/u);
    expect(() => parseFlags(['--data-target', '--dump', 'a'])).toThrow(/--data-target/u);
    expect(() => parseFlags(['--dump'])).toThrow(/--dump/u);
  });

  it('RF-1306 refuses an unknown option', () => {
    expect(() => parseFlags(['--wipe'])).toThrow(/--wipe/u);
  });
});

describe('table count', () => {
  it('RF-1306 reads the number psql prints', () => {
    expect(parseTableCount('12\n')).toBe(12);
    expect(parseTableCount('0\n')).toBe(0);
  });

  it('RF-1306 refuses an answer that is not a number, so no restore goes ahead', () => {
    for (const text of ['', '\n', 'abc', 'ERROR: x', '-1']) {
      expect(() => parseTableCount(text)).toThrow(/table/u);
    }
  });
});
