import { mkdtemp, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StagedFile } from '../../src/application/ports/workbook-staging.js';
import { SpaceReservation } from '../../src/infrastructure/sources/space-reservation.js';
import {
  DiskWorkbookStaging,
  type DiskWorkbookStagingOptions,
} from '../../src/infrastructure/sources/workbook-staging.js';
import { buildCompoundFile } from './compound-fixtures.js';
import { bodyOf } from './upload-store-harness.js';
import {
  buildWorkbook,
  formulaCell,
  numberCell,
  row,
  sharedCell,
  worksheet,
  type SheetSpec,
} from './workbook-fixtures.js';
import { removeWritableTree } from './writable-temp-root.js';

// RF-150, RF-151, RFC-005 section 4.2: the real staging area over a temporary data folder, and
// workbooks built in the test (nothing is committed) to feed it.

export const projectId = '00000000-0000-4000-a000-000000000001';
export const uploadedAt = '2026-10-19T08:00:00.000Z';
export const MB = 1024 * 1024;

export interface StagingSetup {
  readonly dataDir: string;
  readonly staging: DiskWorkbookStaging;
  readonly space: SpaceReservation;
}

export interface StagingOptions extends Partial<Omit<DiskWorkbookStagingOptions, 'dataDir'>> {
  readonly freeBytes?: () => Promise<number>;
}

/** Makes data folders for the tests of a file and removes them after each test. */
export function useStagingFolders(afterEach: (hook: () => Promise<void>) => void) {
  const folders: string[] = [];
  afterEach(async () => {
    for (const folder of folders.splice(0)) await removeWritableTree(folder);
  });
  return async (options: StagingOptions = {}): Promise<StagingSetup> => {
    const dataDir = await realpath(await mkdtemp(join(tmpdir(), 'rst-staging-')));
    folders.push(dataDir);
    const { freeBytes, ...rest } = options;
    const space = new SpaceReservation({
      dataDir,
      ...(freeBytes === undefined ? {} : { freeBytes }),
    });
    return {
      dataDir,
      space,
      staging: new DiskWorkbookStaging({ dataDir, reservation: space, ...rest }),
    };
  };
}

/** A small workbook: a sheet "Summary" with a label, a number and a formula. */
export function sampleBook(extra: readonly SheetSpec[] = []): Promise<Buffer> {
  const summary = worksheet(
    row(1, `${sharedCell('A1', 0)}${numberCell('B1', 20)}`) +
      row(2, `${sharedCell('A2', 1)}${formulaCell('B2', 'B1*2', '40')}`),
  );
  return buildWorkbook({
    sheets: [{ name: 'Summary', xml: summary }, ...extra],
    sharedStrings: ['Quantity', 'Double'],
  });
}

/** A file that starts like a password-protected workbook. */
export function encryptedBook(): Buffer {
  return buildCompoundFile(['EncryptionInfo', 'EncryptedPackage']);
}

/** A file that starts like an old `.xls`. */
export function legacyBook(): Buffer {
  return buildCompoundFile(['Workbook']);
}

/** Opens a batch and receives the files into it; the id and what each file answered. */
export async function stageFiles(
  staging: DiskWorkbookStaging,
  files: readonly (readonly [string, Buffer])[],
  limitBytes = MB,
): Promise<{ readonly id: string; readonly staged: readonly StagedFile[] }> {
  const id = await staging.open(limitBytes);
  const staged: StagedFile[] = [];
  for (const [fileName, bytes] of files) {
    staged.push(
      await staging.receive(id, {
        fileName,
        body: bodyOf(bytes),
        declaredBytes: undefined,
        limitBytes,
        signal: new AbortController().signal,
      }),
    );
  }
  return { id, staged };
}

/** The entries of `<data>/sources/`, or none when it does not exist. */
export async function sourcesOf(dataDir: string): Promise<string[]> {
  try {
    return (await readdir(join(dataDir, 'sources'))).sort();
  } catch {
    return [];
  }
}

/** The files of the one staging folder under `<data>/sources/`. */
export async function stagedNames(dataDir: string): Promise<string[]> {
  const folder = (await sourcesOf(dataDir)).find((name) => name.startsWith('.partial-batch-'));
  if (folder === undefined) return [];
  return (await readdir(join(dataDir, 'sources', folder), { recursive: true })).sort();
}
