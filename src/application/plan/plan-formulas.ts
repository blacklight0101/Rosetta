import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  workbookFormulasOf,
  type FormulaFile,
  type WorkbookFormulas,
} from '../../domain/planning/workbook-formulas.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { PlanInputs } from './plan-inputs.js';
import { scanOfSourceRun, type PlanShapeDependencies } from './plan-shapes.js';

// RF-152, RF-155, RF-623, P3-94: the formulas of the rendered workbooks of a plan run. A project of
// Excel workbooks, or a zip whose scan lists rendered workbooks, has them: each sheet's `formulas.md`
// is read through the read-only reader of the scan of the snapshot the cards were read at. A GitHub
// project has none. A file the reader refuses or that is too large is counted, and a scan that
// cannot be read is logged and leaves the package without the file; the run goes on.

/** The most bytes of one `formulas.md` read; a larger file is counted as unread. */
const readLimitBytes = 8 * 1024 * 1024;

const FILE_NAME = '/formulas.md';

/** The paths of the `formulas.md` files inside the workbook folders, in the order given. */
function formulaPaths(listed: readonly string[], folders: readonly string[]): string[] {
  return listed.filter(
    (path) => path.endsWith(FILE_NAME) && folders.some((folder) => path.startsWith(`${folder}/`)),
  );
}

async function readFiles(
  reader: Pick<RepositoryReader, 'readBytes'>,
  paths: readonly string[],
): Promise<{ files: FormulaFile[]; unread: number }> {
  const files: FormulaFile[] = [];
  let unread = 0;
  for (const path of paths) {
    const result = await reader.readBytes({ path, maxBytes: readLimitBytes });
    const bytes = result.ok ? result.value.bytes : undefined;
    if (bytes === undefined) unread += 1;
    else files.push({ path, text: new TextDecoder().decode(bytes) });
  }
  return { files, unread };
}

// RF-155
export async function planWorkbookFormulas(
  deps: PlanShapeDependencies,
  inputs: Pick<PlanInputs, 'project' | 'sourceRun'>,
): Promise<WorkbookFormulas | undefined> {
  const { project, sourceRun } = inputs;
  if (project.sourceKind === 'github') return undefined;
  const scan = await scanOfSourceRun(deps, inputs);
  if (scan === undefined) return undefined;
  try {
    const { reader, workbookFolders = [] } = await deps.scans.open(scan);
    if (workbookFolders.length === 0) return undefined;
    const paths = formulaPaths(await reader.listFiles(), workbookFolders);
    const { files, unread } = await readFiles(reader, paths);
    return workbookFormulasOf(files, { unread });
  } catch (error) {
    await deps.logger.log({
      ...{ level: 'warn', logger: 'plan', runId: sourceRun.runKey, userId: project.userId },
      code: error instanceof RosettaError ? error.code : ERROR_CODES.codeMapMissing,
      message: 'The scan could not be read, so the package has no workbook-formulas.md.',
    });
    return undefined;
  }
}
