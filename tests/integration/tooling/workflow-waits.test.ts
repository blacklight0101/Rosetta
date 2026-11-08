import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeAz, type FakeAz } from '../../support/fake-az.js';
import { at, keysOf, runStep, stepScript, workflowDocument } from '../../support/workflow-yaml.js';

// DEC-227, P8-141: no workflow holds a runner in a loop to wait for another workflow's check (the
// release checks start from CI's completion event instead), and every remaining poll of an outside
// service (the Azure waits, the wait of scheduled-release.yml for its run to be listed) has a cap on
// its tries and a back-off: a `for _ in` loop with a fixed number of tries, `sleep "$delay"`, and the
// delay doubled up to 30 seconds. A new sleep loop without them fails here. The Azure waits run with
// bash against a fake az that logs each sleep; nothing reaches Azure.

const backOff = 'delay=$(( delay * 2 > 30 ? 30 : delay * 2 ))';

/** What is wrong with the waits of one shell script; empty when it sleeps nowhere or waits well. */
function waitViolations(script: string): string[] {
  if (!/\bsleep\b/u.test(script)) return [];
  const found: string[] = [];
  if (/^\s*(?:while|until)\b/mu.test(script)) found.push('a while or until loop has no cap');
  if (!/^\s*for _ in (?:\$\(seq 1 \d+\)|\d+(?: \d+)*); do$/mu.test(script)) {
    found.push('no for loop with a fixed number of tries');
  }
  if (/\bsleep\b(?! "\$delay"$)/mu.test(script)) found.push('a sleep with a fixed delay');
  if (!script.includes(backOff)) found.push('no doubling back-off up to 30 seconds');
  return found;
}

/** The `run:` scripts of one workflow, as `file job step` and the script. */
async function workflowScripts(file: string): Promise<[string, string][]> {
  const document = await workflowDocument(file);
  return keysOf(at(document, 'jobs')).flatMap((job) => {
    const steps = at(document, 'jobs', job, 'steps');
    const list: unknown[] = Array.isArray(steps) ? steps : [];
    return list.flatMap((step): [string, string][] => {
      const run = at(step, 'run');
      return typeof run === 'string' ? [[`${file} ${job} ${String(at(step, 'name'))}`, run]] : [];
    });
  });
}

/** Every `run:` script of every workflow and every shell script of scripts/. */
async function allScripts(): Promise<[string, string][]> {
  const folder = join(process.cwd(), '.github', 'workflows');
  const files = (await readdir(folder)).filter((file) => file.endsWith('.yml')).sort();
  const found: [string, string][] = [];
  for (const file of files) found.push(...(await workflowScripts(file)));
  const shell = (await readdir(join(process.cwd(), 'scripts'))).filter((f) => f.endsWith('.sh'));
  for (const file of shell.sort()) {
    found.push([`scripts/${file}`, await readFile(join(process.cwd(), 'scripts', file), 'utf8')]);
  }
  return found;
}

describe('workflow waits: caps and back-off (DEC-227)', () => {
  it('DEC-227 every wait in a workflow or a script has a cap on its tries and a doubling back-off', async () => {
    const scripts = await allScripts();
    const found = scripts.flatMap(([where, script]) =>
      waitViolations(script).map((problem) => `${where}: ${problem}`),
    );

    expect(scripts.length).toBeGreaterThan(20);
    expect(found).toEqual([]);
  });

  it('DEC-227 the scan fails a sleep loop without a cap or a back-off, and passes the house pattern', () => {
    const capped = [
      'delay=5',
      'for _ in $(seq 1 9); do',
      '  sleep "$delay"',
      `  ${backOff}`,
      'done',
    ];

    expect(waitViolations('while true; do\n  gh api x\n  sleep 30\ndone')).toEqual([
      'a while or until loop has no cap',
      'no for loop with a fixed number of tries',
      'a sleep with a fixed delay',
      'no doubling back-off up to 30 seconds',
    ]);
    expect(waitViolations('for _ in $(seq 1 80); do\n  sleep 30\ndone')).toEqual([
      'a sleep with a fixed delay',
      'no doubling back-off up to 30 seconds',
    ]);
    expect(waitViolations('until gh api x; do\n  sleep "$delay"\n  ' + backOff + '\ndone')).toEqual(
      ['a while or until loop has no cap', 'no for loop with a fixed number of tries'],
    );
    expect(waitViolations(capped.join('\n'))).toEqual([]);
    expect(waitViolations('echo no wait here')).toEqual([]);
  });

  it('DEC-227 no workflow waits in a loop for another workflow: no step sleeps on a gh lookup of a check', async () => {
    const pollers = (await allScripts()).filter(
      ([, script]) => /\bsleep\b/u.test(script) && /check-runs|check_name/u.test(script),
    );

    expect(pollers.map(([where]) => where)).toEqual([]);
  });
});

let az: FakeAz | undefined;
afterEach(async () => {
  await az?.dispose();
  az = undefined;
});

/** Runs one Azure wait step of `file` against a fake az that never finishes; returns its sleeps. */
async function neverReady(
  file: string,
  step: string,
): Promise<{ code: number; output: string; sleeps: number[] }> {
  az = await fakeAz({ statuses: 'Running' });
  const script = stepScript(await workflowDocument(file), 'deploy', step);
  const env = {
    ...az.env,
    AZ_RG: 'rg-rosetta',
    AZ_APP: 'ca-rosetta',
    AZ_MIGRATE_JOB: 'caj-rosetta-migrate',
    IMAGE: 'ghcr.io/blacklight0101/rosetta',
    SHA_TAG: 'sha-0000000',
    ROSETTA_PUBLIC_URL: 'https://example.test',
  };
  const result = await runStep(script, env, az.prelude);
  return { ...result, sleeps: await az.sleeps() };
}

const sum = (values: number[]): number => values.reduce((total, each) => total + each, 0);

describe('workflow waits: the Azure waits back off and give up (DEC-227)', () => {
  it.each([
    ['release.yml', 'Migrate with the new image', 15],
    ['staging.yml', 'Migrate with the new image', 15],
    ['release.yml', 'Wait for the new revision', 10],
    ['staging.yml', 'Wait for the new revision', 10],
  ])(
    'DEC-227 %s "%s" doubles its wait from 5 to 30 seconds and fails after about %i minutes',
    async (file, step, minutes) => {
      const result = await neverReady(file, step);

      expect(result.code).not.toBe(0);
      expect(result.output).toContain('::error::');
      expect(result.sleeps.slice(0, 5)).toEqual([5, 10, 20, 30, 30]);
      expect(Math.max(...result.sleeps)).toBe(30);
      expect(Math.abs(sum(result.sleeps) - minutes * 60)).toBeLessThanOrEqual(30);
    },
  );
});
