import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SnapshotStore } from '../../../../src/infrastructure/github/snapshot-store.js';
import { summarizeTree } from '../../../../src/infrastructure/github/tree-summary.js';

// RF-152, DEC-183, P5-47: the summary of a tree from hashes taken while the files were written is
// the summary a walk of the tree gives.

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

describe('summarizeTree', () => {
  it('RF-152 gives the count, bytes and hash that inspect gives for the same files, in any order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rst-summarize-'));
    try {
      const files = { 'b/two.md': 'two', 'a.md': 'one', 'b/a/three.md': 'three é' };
      for (const [path, text] of Object.entries(files)) {
        await mkdir(join(root, path, '..'), { recursive: true });
        await writeFile(join(root, path), text, 'utf8');
      }
      const store = new SnapshotStore(root);
      const hashed = Object.entries(files).map(([path, text]) => ({
        path,
        sha256: sha(text),
        bytes: Buffer.byteLength(text, 'utf8'),
      }));

      const walked = await store.inspect(root);

      expect(summarizeTree(hashed)).toEqual(walked);
      expect(summarizeTree([...hashed].reverse())).toEqual(walked);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('RF-152 gives the hash of no files for an empty tree', () => {
    const empty = summarizeTree([]);

    expect(empty).toEqual({
      fileCount: 0,
      totalBytes: 0,
      snapshotHash: `sha256:${createHash('sha256').digest('hex')}`,
    });
  });
});
