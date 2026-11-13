import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLabCaseSet } from '../../../../src/application/lab/lab-case-set.js';
import { runLabCapture } from '../../../../src/presentation/lab/lab-capture-command.js';
import { gapTask, writeRunFolder } from '../../../support/capture-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1404, RF-1405: `npm run lab -- --capture` over a synthetic run folder.

const temp = useTempRoot('rosetta-lab-capture-');

const sources = {
  shop: {
    key: 'shop',
    name: 'Invented shop',
    commit: 'abcdef1234567',
    licence: 'MIT',
  },
};

async function arrange(): Promise<{ lab: string; run: string; file: string }> {
  const lab = join(temp.path, 'lab');
  const run = join(temp.path, 'run');
  const file = join(temp.path, 'sources.json');
  await writeRunFolder(run, 'run-1', [gapTask]);
  await writeFile(file, JSON.stringify(sources));
  return { lab, run, file };
}

describe('the capture command', () => {
  it('RF-1404 writes the case set of the prompt from the run, with its source and a held-back case', async () => {
    const { lab, run, file } = await arrange();
    const lines: string[] = [];

    const code = await runLabCapture(
      ['--prompt', 'planner/gap', '--name', 'gap-test', '--sources', file, '--run', `shop=${run}`],
      lab,
      (line) => lines.push(line),
    );

    expect(code).toBe(0);
    const set = parseLabCaseSet(
      JSON.parse(await readFile(join(lab, 'cases', 'gap-test.json'), 'utf8')),
    );
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    expect(set.value.sources?.[0]).toMatchObject({ key: 'shop', licence: 'MIT', runs: ['run-1'] });
    expect(set.value.cases.map((each) => each.split)).toEqual(['held-back']);
    expect(lines.join('\n')).toContain('1 cases, 1 held back');
  });
});

describe('the capture command refuses', () => {
  it('RF-1404 stops with the ids it can capture for a prompt it has no rule for, and writes nothing', async () => {
    const { lab, run, file } = await arrange();
    const lines: string[] = [];

    const code = await runLabCapture(
      ['--prompt', 'planner/prd', '--name', 'prd-test', '--sources', file, '--run', `shop=${run}`],
      lab,
      (line) => lines.push(line),
    );

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('planner/gap');
    await expect(readFile(join(lab, 'cases', 'prd-test.json'), 'utf8')).rejects.toThrow();
  });

  it('RF-1404 stops on a source the sources file does not list, and on a missing option', async () => {
    const { lab, run, file } = await arrange();
    const lines: string[] = [];
    const print = (line: string): void => void lines.push(line);

    const unknown = await runLabCapture(
      ['--prompt', 'planner/gap', '--name', 'x', '--sources', file, '--run', `other=${run}`],
      lab,
      print,
    );
    const missing = await runLabCapture(['--prompt', 'planner/gap'], lab, print);

    expect([unknown, missing]).toEqual([1, 1]);
    expect(lines.join('\n')).toContain('no source other');
  });
});
