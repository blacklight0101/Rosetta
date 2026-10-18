import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ArchiveWriter } from '../../../../src/application/ports/archive-writer.js';
import { ok } from '../../../../src/domain/errors/result.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { YazlArchiveWriter } from '../../../../src/infrastructure/files/yazl-archive-writer.js';
import { ReportZipWriter } from '../../../../src/infrastructure/report/report-zip-writer.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { filesOf, readZip } from '../../../support/zip-reader.js';

// RF-505, RF-005: the zips of the report are written into the run's `report/` folder, they unzip,
// and a build that is repeated gives a run zip that does not hold the earlier ones.

const data = useTempRoot('rosetta-report-zip-');
const runKey = '20261012-100000-understand';
const scope = scopeFor(runKey);
const names = { run: `${runKey}.zip`, handoff: `${runKey}-handoff.zip` };

function reportFolder(): string {
  return join(
    data.path,
    'users',
    scope.userId,
    'projects',
    scope.projectId,
    'runs',
    runKey,
    'report',
  );
}

async function seed(files: Readonly<Record<string, string>>): Promise<void> {
  const run = dirname(reportFolder());
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(run, path)), { recursive: true });
    await writeFile(join(run, path), text);
  }
}

const writer = () => new ReportZipWriter(data.path, new YazlArchiveWriter(data.path));

async function unzipped(name: string): Promise<Readonly<Record<string, string>>> {
  return filesOf(await readZip(await readFile(join(reportFolder(), name))));
}

const files = {
  'manifest.json': '{}\n',
  'spec.md': '# Specification\n',
  'report/report.html': '<p>report</p>',
  'handoff/README.md': '# Hand-off\n',
};

describe('ReportZipWriter', () => {
  it('RF-505 writes the zip of the run and the zip of the hand-off package beside the report', async () => {
    await seed(files);

    await writer().write(scope, names);

    expect(Object.keys(await unzipped(names.run)).sort()).toEqual([
      `${runKey}/handoff/README.md`,
      `${runKey}/manifest.json`,
      `${runKey}/report/report.html`,
      `${runKey}/spec.md`,
    ]);
    expect(await unzipped(names.handoff)).toEqual({ 'handoff/README.md': '# Hand-off\n' });
  });

  it('RF-505 writes only the zip of the run when no hand-off zip is asked for', async () => {
    await seed(files);

    await writer().write(scope, { run: names.run });

    expect((await readdir(reportFolder())).sort()).toEqual([names.run, 'report.html']);
  });

  it('RF-505 repeats a build without nesting the zips of the earlier one, and leaves no half-written file', async () => {
    await seed(files);

    await writer().write(scope, names);
    await writer().write(scope, names);

    expect(Object.keys(await unzipped(names.run)).filter((path) => path.endsWith('.zip'))).toEqual(
      [],
    );
    expect((await readdir(reportFolder())).sort()).toEqual(
      [names.run, names.handoff, 'report.html'].sort(),
    );
  });
});

describe('ReportZipWriter refusals', () => {
  it('RF-505 refuses, with the report write code, a hand-off zip for a run that has no package', async () => {
    await seed({ 'manifest.json': '{}\n' });

    const failure = await writer()
      .write(scope, names)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RosettaError);
    expect(failure).toMatchObject({ code: ERROR_CODES.reportWriteFailed });
    expect(
      (await readdir(reportFolder()).catch(() => [])).filter((n) => n.endsWith('.part')),
    ).toEqual([]);
  });

  it('RF-005 refuses a run folder that does not exist and writes nothing', async () => {
    const failure = await writer()
      .write(scope, { run: names.run })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: ERROR_CODES.reportWriteFailed });
  });

  it('RF-005 refuses a zip name that holds a folder, or is not a zip, and writes nothing', async () => {
    await seed(files);

    for (const run of ['../escape.zip', 'sub/inside.zip', 'report.txt']) {
      const failure = await writer()
        .write(scope, { run })
        .catch((error: unknown) => error);

      expect(failure).toMatchObject({ code: ERROR_CODES.reportWriteFailed });
    }
    expect(await readdir(reportFolder())).toEqual(['report.html']);
    expect(await readdir(dirname(reportFolder()))).not.toContain('escape.zip');
  });
});

describe('ReportZipWriter failures', () => {
  it('RF-505 removes the half-written zip, and keeps the zip of the earlier build, when the archive fails half way', async () => {
    await seed(files);
    await writer().write(scope, { run: names.run });
    const before = await readFile(join(reportFolder(), names.run));

    const failure = await new ReportZipWriter(data.path, brokenArchive())
      .write(scope, { run: names.run })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: ERROR_CODES.reportWriteFailed });
    expect((await readdir(reportFolder())).sort()).toEqual([names.run, 'report.html']);
    expect(await readFile(join(reportFolder(), names.run))).toEqual(before);
  });

  it('RF-005 refuses a scope that names no run folder, even for an archive that answers', async () => {
    const stranger = { ...scope, runKey: '../other-run' };

    const failure = await new ReportZipWriter(data.path, answeringArchive())
      .write(stranger, { run: names.run })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: ERROR_CODES.reportWriteFailed });
  });
});

/** An archive that answers whatever the scope. */
function answeringArchive(): ArchiveWriter {
  async function* body(): AsyncGenerator<Uint8Array> {
    await Promise.resolve();
    yield new Uint8Array([80, 75]);
  }
  return { archive: () => Promise.resolve(ok(body())) };
}

/** An archive whose first chunk arrives and whose stream then fails. */
function brokenArchive(): ArchiveWriter {
  async function* body(): AsyncGenerator<Uint8Array> {
    await Promise.resolve();
    yield new Uint8Array([80, 75]);
    throw new Error('the disk read failed');
  }
  return { archive: () => Promise.resolve(ok(body())) };
}
