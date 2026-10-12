import { link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import { NodeRunFileReader } from '../../../../src/infrastructure/files/node-run-file-reader.js';
import { runFileReaderContract } from '../../../contracts/run-file-reader.contract.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { collectBytes } from '../../../support/zip-reader.js';

// RF-506, RF-1105, RF-005: one file of a run folder in a temporary data folder. Links are never
// followed, so nothing outside the run folder is read, whatever the request names.

const data = useTempRoot('rosetta-run-file-');
const scope = scopeFor('20261012-100000-understand');
const canLinkFiles = await canMakeFileLinks();

async function canMakeFileLinks(): Promise<boolean> {
  const probe = await mkdtemp(join(tmpdir(), 'rosetta-link-probe-'));
  try {
    await writeFile(join(probe, 'target'), 'x');
    await symlink(join(probe, 'target'), join(probe, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    await rm(probe, { recursive: true, force: true });
  }
}

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

async function outsideFolder(): Promise<string> {
  const outside = join(data.path, 'elsewhere');
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, 'secret.txt'), 'outside\n');
  return outside;
}

const reader = () => new NodeRunFileReader(data.path);
const notFound = { ok: false, error: 'not-found' } as const;

describe('NodeRunFileReader', () => {
  runFileReaderContract('NodeRunFileReader', () => Promise.resolve({ reader: reader(), seed }));

  it('RF-506 reads a binary file byte for byte and reports its size', async () => {
    const binary = Buffer.from(Array.from({ length: 5000 }, (_, index) => (index * 37) % 256));
    await seed(scope, { 'report/logo.bin': binary });

    const opened = await reader().open(scope, 'report/logo.bin');

    if (!opened.ok) throw new Error('The file was refused');
    expect(opened.value.size).toBe(5000);
    expect((await collectBytes(opened.value.body)).equals(binary)).toBe(true);
  });
});

describe('NodeRunFileReader and links', () => {
  it('RF-1105 a folder link inside the run folder is not followed', async () => {
    const outside = await outsideFolder();
    await seed(scope, { 'manifest.json': '{}\n' });
    await symlink(outside, join(runFolder(), 'linked'), 'junction');

    expect(await reader().open(scope, 'linked/secret.txt')).toEqual(notFound);
  });

  it.skipIf(!canLinkFiles)(
    'RF-1105 a file link inside the run folder is not followed',
    async () => {
      const outside = join(await outsideFolder(), 'secret.txt');
      await seed(scope, { 'manifest.json': '{}\n' });
      await symlink(outside, join(runFolder(), 'note.txt'));

      expect(await reader().open(scope, 'note.txt')).toEqual(notFound);
    },
  );

  it('RF-1105 a file hard-linked from outside the run folder is not read', async () => {
    const outside = join(await outsideFolder(), 'secret.txt');
    await seed(scope, { 'manifest.json': '{}\n' });
    await link(outside, join(runFolder(), 'shared.txt'));

    expect(await reader().open(scope, 'shared.txt')).toEqual(notFound);
  });

  it('RF-1105 a run folder that is itself a link is refused', async () => {
    const outside = await outsideFolder();
    await mkdir(dirname(runFolder()), { recursive: true });
    await symlink(outside, runFolder(), 'junction');

    expect(await reader().open(scope, 'secret.txt')).toEqual(notFound);
  });

  it('RF-1105 a user folder linked to a place that holds the whole run path is refused', async () => {
    const elsewhere = join(data.path, 'elsewhere', 'user');
    const folder = join(elsewhere, 'projects', scope.projectId, 'runs', scope.runKey);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'manifest.json'), 'outside');
    await mkdir(join(data.path, 'users'), { recursive: true });
    await symlink(elsewhere, join(data.path, 'users', scope.userId), 'junction');

    expect(await reader().open(scope, 'manifest.json')).toEqual(notFound);
  });
});

describe('NodeRunFileReader and a data folder', () => {
  it('RF-005 answers not-found when the data folder does not exist', async () => {
    const missing = new NodeRunFileReader(join(data.path, 'nothing-here'));

    expect(await missing.open(scope, 'manifest.json')).toEqual(notFound);
  });

  it('RF-005 refuses a run key and an id that are not ids, without touching the disk', async () => {
    await seed(scope, { 'manifest.json': '{}\n' });

    expect(await reader().open({ ...scope, runKey: '../x' }, 'manifest.json')).toEqual(notFound);
    expect(await reader().open({ ...scope, userId: '..' }, 'manifest.json')).toEqual(notFound);
  });

  it('RF-005 reads a file closed by the reader, so removing the run afterwards works', async () => {
    await seed(scope, { 'manifest.json': '{}\n' });
    const opened = await reader().open(scope, 'manifest.json');
    if (!opened.ok) throw new Error('The file was refused');
    await collectBytes(opened.value.body);

    await rm(runFolder(), { recursive: true, force: true });

    expect(await reader().open(scope, 'manifest.json')).toEqual(notFound);
  });
});
