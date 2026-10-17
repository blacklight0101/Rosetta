import { mkdir, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FileHandoffWriter } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { openWriter } from '../../../support/open-writer.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-005, RF-601: the package is written through the workspace guard: a `handoff` folder that is a
// link out of the run folder is refused with RST-1804, and nothing lands where it points.

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const projectId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e70';
const scope = { id: 'run-1', userId, projectId, runKey: '20261012-100000-plan' };

const temp = useTempRoot('rosetta-handoff-link-');

describe('FileHandoffWriter: a linked handoff folder', () => {
  it('RF-005 a handoff folder linked out of the workspace is refused with RST-1804', async () => {
    const data = join(temp.path, 'data');
    const outside = join(temp.path, 'outside');
    const runFolder = join(data, 'users', userId, 'projects', projectId, 'runs', scope.runKey);
    await mkdir(outside, { recursive: true });
    await mkdir(runFolder, { recursive: true });
    await symlink(outside, join(runFolder, 'handoff'), 'junction');
    const writer = new FileHandoffWriter({ writer: openWriter(data), masker: new SecretMasker() });

    await expect(writer.write(scope, handoffOf('Plain text.'))).rejects.toMatchObject({
      code: ERROR_CODES.handoffWriteFailed,
    });
    expect(await readdir(outside, { recursive: true })).toEqual([]);
  });
});
