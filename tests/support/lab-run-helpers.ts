import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLabResults, type LabResults } from '../../src/application/lab/lab-results.js';
import type { LabArgs } from '../../src/presentation/lab/lab-args.js';
import type { LabParts } from '../../src/presentation/lab/compose-lab.js';
import { runLabRun } from '../../src/presentation/lab/lab-command.js';
import { labFolder } from './lab-harness.js';

// RF-1400, RF-1403: a lab command over the fake provider and the committed sample sets, and a read
// of what it wrote.

export const promptsFolder = fileURLToPath(new URL('../../prompts/', import.meta.url));

export type RunArgs = Extract<LabArgs, { kind: 'run' }>;

export const verifierArgs: RunArgs = {
  ...{ kind: 'run', prompt: 'verifier/claim', version: 'v5' },
  ...{ model: { provider: 'fake', model: 'model-a' }, cases: 'verifier-claim-sample' },
  ...{ repetitions: 1, yes: true },
};

export const overviewArgs: RunArgs = {
  ...verifierArgs,
  ...{ prompt: 'summariser/overview', version: 'v1', cases: 'overview-sample' },
};

export interface Finished {
  readonly code: number;
  readonly lines: string[];
}

export async function runLab(parts: LabParts, args: RunArgs): Promise<Finished> {
  const lines: string[] = [];
  const code = await runLabRun(parts, args, { labFolder, promptsFolder }, (line) => {
    lines.push(line);
  });
  return { code, lines };
}

/** The results of every folder of the output directory, in the order of their ids. */
export async function writtenResults(outputDir: string): Promise<LabResults[]> {
  const ids = (await readdir(outputDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const all: LabResults[] = [];
  for (const id of ids) {
    const text = await readFile(join(outputDir, id, 'results.json'), 'utf8');
    const parsed = parseLabResults(JSON.parse(text));
    if (!parsed.ok) throw new Error(parsed.error);
    all.push(parsed.value);
  }
  return all;
}
