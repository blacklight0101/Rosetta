import { bytesText } from './bytes.js';

// RF-158, RF-150: what the page checks before it sends workbooks: each name ends in `.xlsx` or
// `.xlsm` (an `.xls` or `.xlsb` is told to save as `.xlsx`), no file is empty, no two names are
// the same with the case ignored, the count is within the limit and the total is within the size
// limit. Each refusal names the file (or the set), the reason and what to do. The server checks
// again (RF-151).

const megabyte = 1024 * 1024;
const extension = /\.(?<type>[^.]*)$/u;

export interface WorkbookLimits {
  readonly maxFiles: number;
  readonly limitMb: number;
}

function typeOf(fileName: string): string {
  return extension.exec(fileName)?.groups?.['type']?.toLowerCase() ?? '';
}

function fileProblem(file: File): string | undefined {
  const type = typeOf(file.name);
  if (type === 'xls' || type === 'xlsb') {
    return `${file.name} is an older Excel format. Open the file in Excel and save it as .xlsx (or .xlsm if it has macros).`;
  }
  if (type !== 'xlsx' && type !== 'xlsm') {
    return `${file.name} is not an Excel workbook. Choose files ending in .xlsx or .xlsm.`;
  }
  if (file.size === 0) return `${file.name} is empty. Choose a workbook that holds your data.`;
  return undefined;
}

/** The first name used twice (case ignored), or undefined. */
function repeatedName(files: readonly File[]): string | undefined {
  const seen = new Set<string>();
  for (const file of files) {
    const key = file.name.toLowerCase();
    if (seen.has(key)) return file.name;
    seen.add(key);
  }
  return undefined;
}

/** The reasons the chosen files cannot be uploaded, one sentence each; empty when they can. */
// RF-158
export function workbookProblems(files: readonly File[], limits: WorkbookLimits): string[] {
  const problems = files.map(fileProblem).filter((found) => found !== undefined);
  const repeated = repeatedName(files);
  if (repeated !== undefined) {
    problems.push(`Two files are named ${repeated}; rename one and choose the files again.`);
  }
  if (files.length > limits.maxFiles) {
    problems.push(
      `${String(files.length)} files chosen. Upload at most ${String(limits.maxFiles)} workbooks, or split them into projects.`,
    );
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > limits.limitMb * megabyte) {
    problems.push(
      `The files add up to ${bytesText(total)}; the limit is ${String(limits.limitMb)} MB. Remove files that are not part of the system.`,
    );
  }
  return problems;
}

/** The project name an upload starts with: the first file name without its type (RF-150). */
export function workbookProjectName(fileName: string): string {
  return fileName.replace(/\.(?:xlsx|xlsm)$/iu, '');
}
