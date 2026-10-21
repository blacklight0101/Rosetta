import { expect, it } from 'vitest';
import { planWorkbookFormulas } from '../../../../src/application/plan/plan-formulas.js';
import type { ScanResults } from '../../../../src/application/ports/scan-results.js';
import type { Project } from '../../../../src/application/projects/project.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { invoiceRendered } from '../../../support/invoice-formula-files.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { FixtureScans, scanOf, type FixtureContent } from '../../../support/scan-shape-fixtures.js';

// RF-152, RF-155, P3-94: the formulas of the rendered workbooks of a plan run, read through the
// reader of the scan of the snapshot the cards were read at. A GitHub project has none, a scan
// that lists no workbook has none, and a rendered file that cannot be read is counted, not fatal.

const FOLDER = 'Invoice_Sample.xlsm';
const snapshotKey = 'upload__p@0123456789abcdef';

function setup(
  project: Partial<Project>,
  contents: Record<string, FixtureContent>,
  options: { folders?: string[]; unreadable?: string[] } = {},
) {
  const scan = scanOf(contents, { unreadable: options.unreadable ?? [] });
  const folders = options.folders ?? [FOLDER];
  const scans = new FixtureScans(scan, folders);
  const sourceRun = sampleRun({ stage: 'understand', endState: 'Completed', snapshotKey });
  const scanRun = sampleRun({ stage: 'scan', endState: 'Completed', snapshotKey });
  const logger = new MemoryLogger(new FixedClock('2026-10-21T09:00:00.000Z'), new SecretMasker());
  const deps = { runs: { list: () => Promise.resolve([scanRun]) }, scans, logger };
  const inputs = { project: sampleProject({ sourceKind: 'workbook', ...project }), sourceRun };
  return { scan, scans, logger, run: () => planWorkbookFormulas(deps, inputs) };
}

it('RF-155 reads the formulas.md of every sheet of a workbook project, and no other file', async () => {
  const { scan, run } = setup({}, invoiceRendered());

  const formulas = await run();

  expect(formulas?.rows).toHaveLength(9);
  expect(scan.asked.sort()).toEqual([
    `${FOLDER}/Calculation/formulas.md`,
    `${FOLDER}/Invoice/formulas.md`,
    `${FOLDER}/Template/formulas.md`,
  ]);
});

it('RF-155 reads the workbooks of a zip the scan lists', async () => {
  const { run } = setup({ sourceKind: 'upload' }, invoiceRendered());

  expect((await run())?.rows).toHaveLength(9);
});

it('RF-155 reads a workbook in a folder of a zip', async () => {
  const nested = Object.fromEntries(
    Object.entries(invoiceRendered()).map(([path, text]) => [`finance/${path}`, text]),
  );
  const { run } = setup({ sourceKind: 'upload' }, nested, { folders: [`finance/${FOLDER}`] });

  expect((await run())?.rows[0]).toMatchObject({
    workbook: `finance/${FOLDER}`,
    sheet: 'Calculation',
  });
});

it('RF-155 leaves out a formulas.md outside the workbook folders, even one that starts like them', async () => {
  const contents = {
    ...invoiceRendered(),
    'Notes/Sheet/formulas.md':
      '# Formulas of sheet "S"\n\n## Single cells (1 formula)\nA1 = 1+1    [cached: 2]\n',
    [`${FOLDER}2/Sheet/formulas.md`]:
      '# Formulas of sheet "S"\n\n## Single cells (1 formula)\nA1 = 1+1    [cached: 2]\n',
  };
  const { run } = setup({}, contents);

  expect((await run())?.rows).toHaveLength(9);
});

it('RF-155 gives nothing for a GitHub project, whatever its scan lists', async () => {
  const { scans, run } = setup({ sourceKind: 'github' }, invoiceRendered());

  expect(await run()).toBeUndefined();
  expect(scans.opened).toEqual([]);
});

it('RF-155 gives nothing when the scan lists no workbook', async () => {
  const { run } = setup({}, invoiceRendered(), { folders: [] });

  expect(await run()).toBeUndefined();
});

it('RF-155 gives nothing when there is no scan of the snapshot', async () => {
  const none: Run[] = [];
  const deps = {
    runs: { list: () => Promise.resolve(none) },
    scans: new FixtureScans(scanOf(invoiceRendered()), [FOLDER]),
    logger: new MemoryLogger(new FixedClock('2026-10-21T09:00:00.000Z'), new SecretMasker()),
  };
  const inputs = {
    project: sampleProject({ sourceKind: 'workbook' }),
    sourceRun: sampleRun({ stage: 'understand', snapshotKey }),
  };

  expect(await planWorkbookFormulas(deps, inputs)).toBeUndefined();
  expect(deps.scans.opened).toEqual([]);
  expect(deps.logger.entries).toEqual([]);
});

it('RF-155 logs a scan that cannot be opened and gives nothing', async () => {
  const failing: ScanResults = {
    open: () => Promise.reject(new RosettaError(ERROR_CODES.codeMapMissing)),
  };
  const logger = new MemoryLogger(new FixedClock('2026-10-21T09:00:00.000Z'), new SecretMasker());
  const scanRun = sampleRun({ stage: 'scan', endState: 'Completed', snapshotKey });
  const deps = { runs: { list: () => Promise.resolve([scanRun]) }, scans: failing, logger };
  const inputs = {
    project: sampleProject({ sourceKind: 'workbook' }),
    sourceRun: sampleRun({ stage: 'understand', snapshotKey }),
  };

  expect(await planWorkbookFormulas(deps, inputs)).toBeUndefined();
  expect(logger.entries).toMatchObject([{ level: 'warn', code: ERROR_CODES.codeMapMissing }]);
});

it('RF-155 counts a file the reader refuses or that is too large, and reads the others', async () => {
  const contents = {
    ...invoiceRendered(),
    [`${FOLDER}/Big/formulas.md`]: { size: 99_999_999 },
    [`${FOLDER}/Gone/formulas.md`]: 'x',
  };
  const { run } = setup({}, contents, { unreadable: [`${FOLDER}/Gone/formulas.md`] });

  const formulas = await run();

  expect(formulas).toMatchObject({ unread: 2 });
  expect(formulas?.rows).toHaveLength(9);
});
