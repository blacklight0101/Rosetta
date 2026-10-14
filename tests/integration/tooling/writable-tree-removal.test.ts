import { access, chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { removeWritableTree } from '../../support/writable-temp-root.js';

// RNF-005, P1-84: the end-to-end server clears its data folder with the helper that makes read-only
// snapshot trees writable first, so a run that wrote read-only files still cleans up.

describe('removal of a folder that may hold read-only files', () => {
  it('RNF-005 removes a folder whose files and folders are read-only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rosetta-removal-'));
    const folder = join(root, 'data');
    await mkdir(join(folder, 'snapshot'), { recursive: true });
    await writeFile(join(folder, 'snapshot', 'file.txt'), 'content');
    await chmod(join(folder, 'snapshot', 'file.txt'), 0o444);
    await chmod(join(folder, 'snapshot'), 0o555);

    await removeWritableTree(folder);

    await expect(access(folder)).rejects.toMatchObject({ code: 'ENOENT' });
    await removeWritableTree(root);
  });

  it('RNF-005 does nothing, and does not fail, when the folder is missing', async () => {
    const missing = join(tmpdir(), `rosetta-removal-missing-${String(process.pid)}`);

    await expect(removeWritableTree(missing)).resolves.toBeUndefined();
  });
});
