import type { CheckFolders } from '../../infrastructure/lab/judge-check-files.js';
import type { LabParts } from './compose-lab.js';
import type { LabArgs } from './lab-args.js';

// RF-1405: `npm run lab -- --judge-check`.

// RF-1405
export function runJudgeCheck(
  parts: LabParts,
  args: Extract<LabArgs, { kind: 'judge-check' }>,
  folders: CheckFolders,
  print: (line: string) => void,
): Promise<number> {
  print(`not implemented: ${parts.outputDir} ${args.model.model} ${folders.labFolder}`);
  return Promise.resolve(1);
}
