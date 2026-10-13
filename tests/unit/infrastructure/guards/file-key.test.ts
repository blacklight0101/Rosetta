import { describe, expect, it } from 'vitest';
import { fileKey } from '../../../../src/infrastructure/guards/file-key.js';
import { sameFileSpellings } from '../../../support/same-file-spellings.js';

// RF-141: two spellings of one file meet in one key; two different files never do.

const BACKSLASH = String.fromCharCode(0x5c);

describe('fileKey', () => {
  it.each(sameFileSpellings)('RF-141 gives one key to a file named %s', (_name, first, other) => {
    expect(fileKey(first)).toBe(fileKey(other));
  });

  it.each([
    ['src' + BACKSLASH + 'a' + BACKSLASH + 'Web.config', 'src/a/Web.config'],
    ['src/a' + BACKSLASH + 'Web.config', 'src/a/Web.config'],
  ])('RF-141 gives %s the key of %s', (first, other) => {
    expect(fileKey(first)).toBe(fileKey(other));
  });

  it.each([
    ['src/Web.config', 'src/Web.config.bak'],
    ['src/a/Web.config', 'src/b/Web.config'],
    ['src/a.b/Web.config', 'src/ab/Web.config'],
    ['src/i.config', 'src/j.config'],
    ['src/..', 'src/.'],
    ['', 'src'],
  ])('RF-141 keeps the files %s and %s apart', (first, other) => {
    expect(fileKey(first)).not.toBe(fileKey(other));
  });
});
