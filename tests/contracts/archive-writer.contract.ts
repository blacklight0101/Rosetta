import { expect, it } from 'vitest';
import type { ArchivePart, ArchiveWriter } from '../../src/application/ports/archive-writer.js';
import type { RunScope } from '../../src/application/ports/run-events.js';
import { scopeFor } from '../support/run-event-fixtures.js';
import { collectBytes, filesOf, readZip } from '../support/zip-reader.js';

// Architecture section 7: every ArchiveWriter (the yazl writer, the memory writer) passes this
// suite. RF-008: the full archive holds the run folder's files under `<runKey>/`, the hand-off
// archive only `handoff/`; a run without that folder is refused; RF-1105: the owner is part of
// the scope, so another user's scope finds nothing.

interface ArchiveFixture {
  readonly writer: ArchiveWriter;
  /** Gives the run a folder with these files (`path` relative to the run folder). */
  readonly seed: (scope: RunScope, files: Readonly<Record<string, string>>) => Promise<void>;
}

export type FreshArchives = () => Promise<ArchiveFixture>;

const scope = scopeFor('20261012-100000-understand');
const stranger = { ...scope, userId: '00000000-0000-4000-9000-0000000000b2' };
const files = {
  'manifest.json': '{"schemaVersion":1}\n',
  'cards/BEHAVIOUR/BEH-001.md': '# Orders\n',
  'handoff/README.md': '# Hand-off\n',
  'handoff/tasks/T-001.md': '# Task\n',
};

/** The files of the archive of a part, by entry name. */
async function filesArchived(writer: ArchiveWriter, of: RunScope, part: ArchivePart) {
  const result = await writer.archive(of, part);
  if (!result.ok) throw new Error('The run was not archived');
  return filesOf(await readZip(await collectBytes(result.value)));
}

export function archiveWriterContract(name: string, fresh: FreshArchives): void {
  it(`RF-008 ${name} zips the complete run folder under the run key`, async () => {
    const { writer, seed } = await fresh();
    await seed(scope, files);

    const archived = await filesArchived(writer, scope, 'run');

    expect(archived).toEqual(
      Object.fromEntries(
        Object.entries(files).map(([path, text]) => [`${scope.runKey}/${path}`, text]),
      ),
    );
  });

  it(`RF-008 ${name} zips only the handoff folder for the hand-off part`, async () => {
    const { writer, seed } = await fresh();
    await seed(scope, files);

    expect(await filesArchived(writer, scope, 'handoff')).toEqual({
      'handoff/README.md': '# Hand-off\n',
      'handoff/tasks/T-001.md': '# Task\n',
    });
  });

  it(`RF-008 ${name} refuses the hand-off of a run that has none`, async () => {
    const { writer, seed } = await fresh();
    await seed(scope, { 'manifest.json': '{}\n' });

    expect(await writer.archive(scope, 'handoff')).toEqual({ ok: false, error: 'not-found' });
  });

  it(`RF-008 ${name} refuses a run that has no folder`, async () => {
    const { writer } = await fresh();

    expect(await writer.archive(scope, 'run')).toEqual({ ok: false, error: 'not-found' });
  });

  it(`RF-1105 ${name} finds nothing in another user's folder`, async () => {
    const { writer, seed } = await fresh();
    await seed(scope, files);

    expect(await writer.archive(stranger, 'run')).toEqual({ ok: false, error: 'not-found' });
    expect(await writer.archive(stranger, 'handoff')).toEqual({ ok: false, error: 'not-found' });
  });
}
