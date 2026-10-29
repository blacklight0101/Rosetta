import { createHash } from 'node:crypto';
import { vi, type MockInstance } from 'vitest';
import type {
  BatchRef,
  WorkbookBatches,
} from '../../src/application/use-cases/workbook-batches.js';
import { uploadSnapshotKey } from '../../src/domain/sources/upload-name.js';
import { workbookSnapshotKey } from '../../src/domain/sources/workbook-key.js';
import { amy as zipper, request, setup } from './store-upload-harness.js';
import { amy, batchCase, fileRequest } from './workbook-batch-harness.js';

// RF-159, DEC-188: a batch, of workbooks or of a zip, whose attach is held past its 40 ms limit and let
// go by the test. `mode` says how the held attach ends: as the real one, with a failure, or with a
// failure after the project row was written.

export const LIMIT_MS = 40;
export type Mode = 'lands' | 'fails' | 'fails-after-commit';
export interface Options {
  readonly mode?: Mode;
  /** The snapshot of the batch is already stored, so the batch did not create it. */
  readonly existing?: boolean;
}

type Repository = Awaited<ReturnType<typeof batchCase>>['projects'];
type Common = Pick<
  Awaited<ReturnType<typeof batchCase>>,
  'projects' | 'logger' | 'uploads' | 'clock'
>;

/** A batch whose attach is held: the world it lives in, how to read and open it, and the held attach. */
export interface Started {
  readonly world: Common;
  readonly ref: BatchRef;
  readonly attach: { readonly release: () => void; readonly spy: MockInstance };
  /** Whether the project is free: a new batch can be opened, or a zip claimed. */
  readonly open: () => Promise<boolean>;
  readonly batches: Pick<WorkbookBatches, 'state' | 'close'>;
  readonly key: string;
}

/** `attachUpload` is held until `release`. */
function held(projects: Repository, mode: Mode): Started['attach'] {
  const real = projects.attachUpload.bind(projects);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(projects, 'attachUpload').mockImplementation(async (change) => {
    await gate;
    if (mode === 'fails') throw new Error('database gone');
    const attached = await real(change);
    if (mode === 'fails-after-commit') throw new Error('connection lost after commit');
    return attached;
  });
  return { release, spy };
}

/** The key the fake staging area gives a batch holding Pricing.xlsx: the hash of the file names. */
export function workbookKeyOf(projectId: string): string {
  const hash = `sha256:${createHash('sha256').update('Pricing.xlsx').digest('hex')}`;
  return workbookSnapshotKey(projectId, hash);
}

export async function workbookBatch(options: Options = {}): Promise<Started> {
  const world = await batchCase(undefined, { attachTimeoutMs: LIMIT_MS });
  if (options.existing === true) world.staging.existing.add(workbookKeyOf(world.project.id));
  const opened = await world.useCase.open({ actor: amy, projectId: world.project.id });
  if (!opened.ok) throw new Error('open refused');
  const { batchId } = opened.value;
  await world.useCase.receive(fileRequest(world.project, batchId));
  const attach = held(world.projects, options.mode ?? 'lands');
  const ref = { actor: amy, projectId: world.project.id, batchId };
  await world.useCase.finish({ ...ref, ip: '203.0.113.7' });
  const open = async () =>
    (await world.useCase.open({ actor: amy, projectId: world.project.id })).ok;
  return { world, ref, attach, open, batches: world.useCase, key: workbookKeyOf(world.project.id) };
}

export async function zipBatch(options: Options = {}): Promise<Started> {
  const world = await setup(undefined, { attachTimeoutMs: LIMIT_MS });
  world.uploads.held = { entries: [], lines: [], leftOut: [] };
  world.uploads.announcesWorkbooks = true;
  const key = uploadSnapshotKey(world.project.id, world.uploads.hash);
  if (options.existing === true) world.uploads.existing.add(key);
  const attach = held(world.projects, options.mode ?? 'lands');
  const outcome = await world.useCase.execute(request(world.project));
  if (!outcome.ok || !('accepted' in outcome.value)) throw new Error('not accepted');
  const ref = {
    actor: zipper,
    projectId: world.project.id,
    batchId: outcome.value.accepted.batchId,
  };
  const open = () => world.batches.claim(world.project.id);
  return { world, ref, attach, open, batches: world.batches, key };
}
