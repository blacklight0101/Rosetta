import { expect, it } from 'vitest';
import type {
  FolderTarget,
  WorkspaceFolders,
} from '../../src/application/ports/workspace-folders.js';

// Architecture section 7: every WorkspaceFolders adapter (NodeWorkspaceFolders, the memory fake of
// tests/support) passes this suite. RF-1012: the size is what the folder holds, a removal takes the
// folder and what is inside it, and a folder that is not there has size 0 and removes without error.

export const folderUser = '00000000-0000-4000-9000-0000000000a1';
export const folderProject = '00000000-0000-4000-a000-0000000000a1';
const otherProject = '00000000-0000-4000-a000-0000000000a2';
const firstRun = '20261012-100000-scan';
const secondRun = '20261012-100100-understand';

const projectTarget: FolderTarget = { userId: folderUser, projectId: folderProject };
const runTarget = (runKey: string): FolderTarget => ({ ...projectTarget, runKey });

/** An adapter with a way to put files into one of its folders (a test cannot use the port to write). */
export interface FoldersUnderTest {
  readonly folders: WorkspaceFolders;
  readonly seed: (target: FolderTarget, files: Readonly<Record<string, string>>) => Promise<void>;
}

export type FreshFolders = () => Promise<FoldersUnderTest>;

function sizingTests(name: string, fresh: FreshFolders): void {
  it(`RF-1012 ${name} sizes a run folder by its files, nested ones included`, async () => {
    const { folders, seed } = await fresh();
    await seed(runTarget(firstRun), { 'manifest.json': '12345', 'cards/FEAT/FEAT-001.md': '123' });

    expect(await folders.size(runTarget(firstRun))).toBe(8);
  });

  it(`RF-1012 ${name} sizes a project folder with the run folders inside it`, async () => {
    const { folders, seed } = await fresh();
    await seed(projectTarget, { 'codemap.json': '12' });
    await seed(runTarget(firstRun), { 'manifest.json': '12345' });
    await seed(runTarget(secondRun), { 'events.jsonl': '1234567' });

    expect(await folders.size(projectTarget)).toBe(14);
    expect(await folders.size(runTarget(secondRun))).toBe(7);
  });
}

function listingTests(name: string, fresh: FreshFolders): void {
  it(`P1-152 ${name} lists project and run folders, a project before its runs, with their change instant`, async () => {
    const { folders, seed } = await fresh();
    await seed(runTarget(secondRun), { 'events.jsonl': '1' });
    await seed(runTarget(firstRun), { 'manifest.json': '12345' });
    const other = { ...projectTarget, projectId: otherProject };
    await seed(other, { 'codemap.json': '123' });

    const listed = await folders.list();

    expect(listed.map((entry) => entry.target)).toEqual([
      projectTarget,
      runTarget(firstRun),
      runTarget(secondRun),
      other,
    ]);
    expect(listed.every((entry) => Number.isFinite(entry.modifiedAt))).toBe(true);
  });

  it(`P1-152 ${name} lists nothing when there are no folders`, async () => {
    const { folders } = await fresh();

    expect(await folders.list()).toEqual([]);
  });
}

function removalTests(name: string, fresh: FreshFolders): void {
  it(`RF-1012 ${name} removes a run folder and leaves its siblings and its project`, async () => {
    const { folders, seed } = await fresh();
    await seed(projectTarget, { 'codemap.json': '12' });
    await seed(runTarget(firstRun), { 'manifest.json': '12345' });
    await seed(runTarget(secondRun), { 'events.jsonl': '1234567' });

    await folders.remove(runTarget(firstRun));

    expect(await folders.size(runTarget(firstRun))).toBe(0);
    expect(await folders.size(runTarget(secondRun))).toBe(7);
    expect(await folders.size(projectTarget)).toBe(9);
  });

  it(`RF-1012 ${name} removes a project folder with its runs and leaves another project`, async () => {
    const { folders, seed } = await fresh();
    await seed(runTarget(firstRun), { 'manifest.json': '12345' });
    const other = { ...projectTarget, projectId: otherProject };
    await seed(other, { 'codemap.json': '123' });

    await folders.remove(projectTarget);

    expect(await folders.size(projectTarget)).toBe(0);
    expect(await folders.size(runTarget(firstRun))).toBe(0);
    expect(await folders.size(other)).toBe(3);
  });

  it(`RF-1012 ${name} sizes a missing folder as 0 and removes it without an error`, async () => {
    const { folders } = await fresh();

    expect(await folders.size(runTarget(firstRun))).toBe(0);
    await expect(folders.remove(runTarget(firstRun))).resolves.toBeUndefined();
    await expect(folders.remove(projectTarget)).resolves.toBeUndefined();
  });
}

function markingTests(name: string, fresh: FreshFolders): void {
  it(`P2-41 ${name} lists a folder as unmarked until a delete marks it`, async () => {
    const { folders, seed } = await fresh();
    await seed(runTarget(firstRun), { 'manifest.json': '1' });

    const listed = await folders.list();

    expect(listed.map((entry) => entry.marked)).toEqual([false, false]);
  });

  it(`P2-41 ${name} marks one folder only, project and run apart, and unmark clears it`, async () => {
    const { folders, seed } = await fresh();
    await seed(runTarget(firstRun), { 'manifest.json': '1' });
    await seed(runTarget(secondRun), { 'events.jsonl': '1' });

    await folders.mark(runTarget(secondRun));
    const marked = (await folders.list()).filter((entry) => entry.marked);
    await folders.mark(projectTarget);
    await folders.mark(projectTarget);
    const both = (await folders.list()).filter((entry) => entry.marked);
    await folders.unmark(runTarget(secondRun));
    await folders.unmark(projectTarget);
    const none = (await folders.list()).filter((entry) => entry.marked);

    expect(marked.map((entry) => entry.target)).toEqual([runTarget(secondRun)]);
    expect(both.map((entry) => entry.target)).toEqual([projectTarget, runTarget(secondRun)]);
    expect(none).toEqual([]);
  });
}

function markedFolderTests(name: string, fresh: FreshFolders): void {
  it(`P2-41 ${name} keeps the size of a folder when it is marked`, async () => {
    const { folders, seed } = await fresh();
    await seed(runTarget(firstRun), { 'manifest.json': '12345' });

    await folders.mark(runTarget(firstRun));

    expect(await folders.size(runTarget(firstRun))).toBe(5);
  });

  it(`P2-41 ${name} marks and unmarks a missing folder without an error, and lists nothing`, async () => {
    const { folders } = await fresh();

    await expect(folders.mark(projectTarget)).resolves.toBeUndefined();
    await expect(folders.unmark(projectTarget)).resolves.toBeUndefined();
    expect(await folders.list()).toEqual([]);
  });

  it(`P2-41 ${name} removes a marked folder`, async () => {
    const { folders, seed } = await fresh();
    await seed(projectTarget, { 'codemap.json': '12' });
    await folders.mark(projectTarget);

    await folders.remove(projectTarget);

    expect(await folders.list()).toEqual([]);
  });
}

export function workspaceFoldersContract(name: string, fresh: FreshFolders): void {
  markingTests(name, fresh);
  markedFolderTests(name, fresh);
  sizingTests(name, fresh);
  removalTests(name, fresh);
  listingTests(name, fresh);
}
