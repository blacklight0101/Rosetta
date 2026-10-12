import { link, mkdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { setImmediate as nextTick } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import type { ArchivePart } from '../../../../src/application/ports/archive-writer.js';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import { YazlArchiveWriter } from '../../../../src/infrastructure/files/yazl-archive-writer.js';
import { archiveWriterContract } from '../../../contracts/archive-writer.contract.js';
import { treeOf, treeOfEntries } from '../../../support/folder-tree.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { collectBytes, readZip } from '../../../support/zip-reader.js';

// RF-008, RF-1105: the zip of a run folder in a temporary data folder, unzipped and compared with
// the folder. Links are never followed, so nothing outside the run folder is archived.
const data = useTempRoot('rosetta-zip-');
const scope = scopeFor('20261012-100000-understand');

function runFolder(of: RunScope = scope): string {
  const parts = ['users', of.userId, 'projects', of.projectId, 'runs', of.runKey];
  return join(data.path, ...parts);
}

async function seed(of: RunScope, files: Readonly<Record<string, string | Buffer>>) {
  await mkdir(runFolder(of), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(runFolder(of), path)), { recursive: true });
    await writeFile(join(runFolder(of), path), content);
  }
}

async function archived(part: ArchivePart, of: RunScope = scope) {
  const result = await new YazlArchiveWriter(data.path).archive(of, part);
  if (!result.ok) throw new Error('The run was not archived');
  return await readZip(await collectBytes(result.value));
}

async function outsideFolder(): Promise<string> {
  const outside = join(data.path, 'elsewhere');
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, 'secret.txt'), 'outside\n');
  return outside;
}

describe('YazlArchiveWriter', () => {
  archiveWriterContract('YazlArchiveWriter', () =>
    Promise.resolve({ writer: new YazlArchiveWriter(data.path), seed }),
  );

  it('RF-008 the unzipped archive has the tree of the run folder, empty folders and binary files included', async () => {
    const binary = Buffer.from(Array.from({ length: 3000 }, (_, index) => (index * 37) % 256));
    await seed(scope, {
      'manifest.json': '{"schemaVersion":1}\n',
      'events.jsonl': '{"seq":1}\n{"seq":2}\n',
      'cards/BEHAVIOUR/BEH-001.md': '# Orders\n',
      'transcripts/task-1.jsonl': 'café 日本\n',
      'report/logo.bin': binary,
      'handoff/README.md': '# Hand-off\n',
    });
    await mkdir(join(runFolder(), 'invalid-output'));

    const entries = await archived('run');

    expect(treeOfEntries(entries, `${scope.runKey}/`)).toEqual(await treeOf(runFolder()));
  });
});

describe('YazlArchiveWriter and the hand-off', () => {
  it('RF-008 the hand-off archive holds exactly the handoff folder', async () => {
    await seed(scope, {
      'manifest.json': '{}\n',
      'handoff/README.md': '# Hand-off\n',
      'handoff/adr/ADR-001.md': '# ADR\n',
    });

    const entries = await archived('handoff');

    expect(treeOfEntries(entries, 'handoff/')).toEqual(await treeOf(join(runFolder(), 'handoff')));
  });

  it('RF-008 lists the entries in a stable order', async () => {
    await seed(scope, { 'b.txt': 'b', 'a.txt': 'a', 'c/d.txt': 'd', 'c/a.txt': 'a' });

    const names = (await archived('run')).map((entry) => entry.name);

    expect(names).toEqual([...names].sort());
  });
});

describe('YazlArchiveWriter and links', () => {
  it('RF-1105 a folder link inside the run folder is not followed', async () => {
    const outside = await outsideFolder();
    await seed(scope, { 'manifest.json': '{}\n' });
    await symlink(outside, join(runFolder(), 'linked'), 'junction');

    const entries = await archived('run');

    expect(entries.map((entry) => entry.name)).toEqual([`${scope.runKey}/manifest.json`]);
  });

  it('RF-1105 a file link inside the run folder is not archived', async () => {
    const outside = join(await outsideFolder(), 'secret.txt');
    await seed(scope, { 'manifest.json': '{}\n' });
    // A system that refuses file links cannot make one, and then there is nothing to skip.
    await symlink(outside, join(runFolder(), 'note.txt')).catch(() => undefined);

    const entries = await archived('run');

    expect(entries.map((entry) => entry.name)).toEqual([`${scope.runKey}/manifest.json`]);
  });

  it('RF-1105 a file hard-linked from outside the run folder is not archived', async () => {
    const outside = join(await outsideFolder(), 'secret.txt');
    await seed(scope, { 'manifest.json': '{}\n' });
    await link(outside, join(runFolder(), 'shared.txt'));

    const entries = await archived('run');

    expect(entries.map((entry) => entry.name)).toEqual([`${scope.runKey}/manifest.json`]);
  });
});

describe('YazlArchiveWriter and linked folders', () => {
  it('RF-1105 a run folder that is itself a link is refused', async () => {
    const outside = await outsideFolder();
    await mkdir(dirname(runFolder()), { recursive: true });
    await symlink(outside, runFolder(), 'junction');

    const result = await new YazlArchiveWriter(data.path).archive(scope, 'run');

    expect(result).toEqual({ ok: false, error: 'not-found' });
  });

  it('RF-1105 a handoff folder that is a link is refused', async () => {
    const outside = await outsideFolder();
    await seed(scope, { 'manifest.json': '{}\n' });
    await symlink(outside, join(runFolder(), 'handoff'), 'junction');

    const result = await new YazlArchiveWriter(data.path).archive(scope, 'handoff');

    expect(result).toEqual({ ok: false, error: 'not-found' });
  });

  it('RF-1105 a user folder that is a link to another place is refused', async () => {
    const outside = await outsideFolder();
    await mkdir(join(data.path, 'users'), { recursive: true });
    await symlink(outside, join(data.path, 'users', scope.userId), 'junction');

    const result = await new YazlArchiveWriter(data.path).archive(scope, 'run');

    expect(result).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('YazlArchiveWriter and large runs', () => {
  it('RF-008 streams a large file instead of holding the archive in memory', async () => {
    const large = Buffer.alloc(24 * 1024 * 1024);
    for (let at = 0; at < large.length; at += 4) large.writeUInt32LE((at * 2654435761) >>> 0, at);
    await seed(scope, { 'transcripts/large.jsonl': large });
    const result = await new YazlArchiveWriter(data.path).archive(scope, 'run');
    if (!result.ok) throw new Error('The run was not archived');
    const stream = result.value;
    if (!(stream instanceof Readable)) throw new Error('The archive is not a byte stream');

    // Nothing reads the stream, so a streaming writer stops at its buffer limit.
    for (let tick = 0; tick < 50; tick += 1) await nextTick();
    const buffered = stream.readableLength;
    stream.destroy();

    expect(buffered).toBeLessThan(1024 * 1024);
  });
});
