/* eslint-disable @typescript-eslint/no-unused-vars -- red skeleton, replaced by the feat commit */
import type { LabParts } from './compose-lab.js';
import type { LabArgs } from './lab-args.js';

// RF-1400, RF-1403: `npm run lab`.

export interface LabFolders {
  readonly labFolder: string;
  readonly promptsFolder: string;
}

export function runLabRun(
  _parts: LabParts,
  _args: Extract<LabArgs, { kind: 'run' }>,
  _folders: LabFolders,
  _print: (line: string) => void,
): Promise<number> {
  throw new Error('not implemented');
}

export function runLabCompare(
  _outputDir: string,
  _a: string,
  _b: string,
  _print: (line: string) => void,
): Promise<number> {
  throw new Error('not implemented');
}
