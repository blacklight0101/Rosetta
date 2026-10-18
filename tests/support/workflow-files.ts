import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The workflows of .github/workflows read as text for the workflow tests
// (tests/integration/tooling/workflow*.test.ts): no YAML parser is in the package baseline.
const folder = join(process.cwd(), '.github', 'workflows');

export interface Workflow {
  readonly name: string;
  readonly lines: string[];
}

export async function load(): Promise<Workflow[]> {
  const names = (await readdir(folder)).filter((name) => name.endsWith('.yml')).sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      lines: (await readFile(join(folder, name), 'utf8')).split(/\r?\n/u),
    })),
  );
}

const indentOf = (line: string): number => line.length - line.trimStart().length;
const textOf = (workflow: Workflow | undefined): string => (workflow?.lines ?? []).join('\n');

/** Lines that belong to a `run:` value, including the one-line form. */
export function runLines(lines: string[]): string[] {
  const found: string[] = [];
  lines.forEach((line, i) => {
    const match = /^(\s*)(- )?run:\s*(.*)$/u.exec(line);
    if (!match) return;
    found.push(match[3] ?? '');
    const base = (match[1] ?? '').length + (match[2] === undefined ? 0 : 2);
    for (const next of lines.slice(i + 1)) {
      if (next.trim() !== '' && indentOf(next) <= base) break;
      found.push(next);
    }
  });
  return found;
}

/** The job blocks: the lines between `  <id>:` and the next job at the same indentation. */
export function jobs(lines: string[]): { id: string; body: string[] }[] {
  const start = lines.indexOf('jobs:');
  const result: { id: string; body: string[] }[] = [];
  for (const line of lines.slice(start + 1)) {
    const header = /^ {2}([\w-]+):\s*$/u.exec(line);
    if (header) result.push({ id: header[1] ?? '', body: [] });
    else result.at(-1)?.body.push(line);
  }
  return result;
}

/** Runs a check on every workflow and returns "<file>: <problem>" lines; an empty list passes. */
export async function violations(check: (workflow: Workflow) => string[]): Promise<string[]> {
  return (await load()).flatMap((workflow) =>
    check(workflow).map((problem) => `${workflow.name}: ${problem}`),
  );
}

/** The text of one workflow file of .github/workflows. */
export const workflowText = async (name: string): Promise<string> =>
  textOf((await load()).find((workflow) => workflow.name === name));

export const ci = (): Promise<string> => workflowText('ci.yml');

/** The body of one job of ci.yml, as text. */
export async function ciJob(id: string): Promise<string> {
  const lines = (await load()).find((workflow) => workflow.name === 'ci.yml')?.lines ?? [];
  return (jobs(lines).find((job) => job.id === id)?.body ?? []).join('\n');
}

/** The ids of the jobs of one workflow file. */
export async function jobIds(name: string): Promise<string[]> {
  const lines = (await load()).find((workflow) => workflow.name === name)?.lines ?? [];
  return jobs(lines).map((job) => job.id);
}

/**
 * RNF-003, P1-55: the problems of one workflow with the trigger and secrets rule: no
 * `pull_request_target`, and no `secrets.` anywhere except in the deploy job of release.yml.
 */
export function triggerAndSecretProblems(workflow: Workflow): string[] {
  const code = workflow.lines.filter((line) => !line.trimStart().startsWith('#'));
  const head = code.slice(0, code.indexOf('jobs:'));
  const outsideDeploy = jobs(code)
    .filter((job) => workflow.name !== 'release.yml' || job.id !== 'deploy')
    .flatMap((job) => job.body);
  return [
    ...(code.join('\n').includes('pull_request_target') ? ['pull_request_target'] : []),
    ...([...head, ...outsideDeploy].join('\n').includes('secrets.') ? ['secrets context'] : []),
  ];
}
