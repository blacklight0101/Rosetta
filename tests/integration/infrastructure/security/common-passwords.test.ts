import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  commonPasswordsFile,
  loadCommonPasswords,
} from '../../../../src/infrastructure/security/common-passwords.js';
import { failureOf } from '../../../support/failure-of.js';

// RF-1103: the shipped list of the 10,000 most common passwords (SecLists, MIT). Comment lines
// carry the source and the licence and are not entries; entries are kept in lower case.

const folders: string[] = [];

afterAll(async () => {
  await Promise.all(
    folders.map((folder) =>
      rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    ),
  );
});

describe('common passwords', () => {
  it('RF-1103 loads the shipped list of the 10,000 most common passwords', async () => {
    const list = await loadCommonPasswords(commonPasswordsFile);

    expect(list.size).toBeGreaterThanOrEqual(10_000);
    expect(list.has(['pass', 'word'].join(''))).toBe(true);
    expect(list.has('123456')).toBe(true);
    expect([...list].some((entry) => entry.startsWith('#'))).toBe(false);
  });

  it('RF-1103 skips comment and empty lines and keeps entries in lower case', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rst-common-'));
    folders.push(folder);
    const file = join(folder, 'list.txt');
    await writeFile(file, '# Source: test\r\n\r\nQwerty\r\nletmein\n', 'utf8');

    const list = await loadCommonPasswords(file);

    expect([...list]).toEqual(['qwerty', 'letmein']);
  });

  it('RF-1103 a missing list stops the start-up with RST-2501', async () => {
    const failure = await failureOf(loadCommonPasswords(join(tmpdir(), 'rst-missing-list.txt')));

    expect(failure).toBeInstanceOf(RosettaError);
    expect(failure).toMatchObject({ code: ERROR_CODES.blocklistUnreadable });
  });
});
