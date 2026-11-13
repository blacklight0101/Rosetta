import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRunFolder } from '../../../../src/infrastructure/lab/run-folder.js';
import { gapTask, mergeTask, writeRunFolder } from '../../../support/capture-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1404: the capture reads a saved run folder and changes nothing in it.

const temp = useTempRoot('rosetta-run-folder-');

describe('reading a run folder', () => {
  it('RF-1404 reads the run id, the reader turns and every transcript', async () => {
    await writeRunFolder(temp.path, 'run-9', [gapTask, mergeTask]);

    const run = await readRunFolder(temp.path, 'shop');

    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.value).toMatchObject({ key: 'shop', runId: 'run-9', maxTurns: 9 });
    expect(run.value.tasks.map((each) => each.name)).toEqual(['planner-gap', 'summariser-br-2']);
    expect(run.value.tasks[0]?.messages.map((each) => each.role)).toEqual([
      'system',
      'user',
      'assistant',
    ]);
  });

  it('RF-1404 finds the run in a folder that holds exactly one', async () => {
    await writeRunFolder(join(temp.path, '20261109-run'), 'run-10', [gapTask]);

    const run = await readRunFolder(temp.path, 'shop');

    expect(run.ok ? run.value.runId : run.error).toBe('run-10');
  });

  it('RF-1404 refuses a folder with no run, and a folder with two', async () => {
    await mkdir(join(temp.path, 'empty'));
    await writeRunFolder(join(temp.path, 'two', 'a'), 'a', [gapTask]);
    await writeRunFolder(join(temp.path, 'two', 'b'), 'b', [gapTask]);

    const none = await readRunFolder(join(temp.path, 'empty'), 'shop');
    const two = await readRunFolder(join(temp.path, 'two'), 'shop');

    expect(none.ok).toBe(false);
    expect(two.ok).toBe(false);
  });

  it('RF-1404 writes nothing into the run folder', async () => {
    await writeRunFolder(temp.path, 'run-9', [gapTask]);
    const before = await readFile(join(temp.path, 'manifest.json'), 'utf8');

    await readRunFolder(temp.path, 'shop');

    expect(await readdir(temp.path)).toEqual(['manifest.json', 'transcripts']);
    expect(await readFile(join(temp.path, 'manifest.json'), 'utf8')).toBe(before);
  });
});
