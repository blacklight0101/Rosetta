import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filesHoldingIn } from '../../e2e/support/run-folder.js';

// RF-1011, P1-155: the check that no file of the server's data folder holds a key. A temporary file
// the server is about to rename is not a file of the run, and a file renamed away between the
// listing and its read is gone, not a leak: neither may fail the check. Other read errors still do.

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rosetta-run-folder-files-'));
  await mkdir(join(root, 'run'), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function enoent(path: string): Error {
  return Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: 'ENOENT' });
}

describe('filesHoldingIn', () => {
  it('RF-1011 looks at the final files only, not at a temporary file of the server', async () => {
    await writeFile(join(root, 'run', 'events.jsonl'), 'line with the text\n');
    await writeFile(join(root, 'run', '.report.json.1234.tmp'), 'the text, not yet renamed\n');

    const found = await filesHoldingIn(root, 'the text');

    expect(found.looked).toBe(1);
    expect(found.held).toEqual([join(root, 'run', 'events.jsonl')]);
  });

  it('RF-1011 skips a file renamed away between the listing and its read, and checks the others', async () => {
    const gone = join(root, 'run', 'gone.jsonl');
    await writeFile(gone, 'the text\n');
    await writeFile(join(root, 'run', 'kept.jsonl'), 'the text\n');
    const read = (file: string): Promise<string> =>
      file === gone ? Promise.reject(enoent(file)) : readFile(file, 'utf8');

    const found = await filesHoldingIn(root, 'the text', read);

    expect(found.held).toEqual([join(root, 'run', 'kept.jsonl')]);
  });

  it('RF-1011 rethrows a read error other than ENOENT', async () => {
    await writeFile(join(root, 'run', 'locked.jsonl'), 'x\n');
    const read = (): Promise<string> =>
      Promise.reject(Object.assign(new Error('EPERM: denied'), { code: 'EPERM' }));

    await expect(filesHoldingIn(root, 'x', read)).rejects.toThrow('EPERM: denied');
  });
});
