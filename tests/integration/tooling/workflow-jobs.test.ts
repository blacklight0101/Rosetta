import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ciJob, load } from '../../support/workflow-files.js';

// The job layout of ci.yml (P1-177, environments-and-delivery.md section 6): the static gates run in
// their own job in parallel with the tests, and the required checks keep their names.

describe('GitHub Actions workflows: job layout', () => {
  it('P1-177 the static gates run in their own Linux job, one step per gate, in parallel with the tests', async () => {
    const gates = await ciJob('gates');
    const tests = await ciJob('tests');

    expect(gates).toMatch(/^ {4}runs-on: ubuntu-latest$/mu);
    expect(gates).toMatch(/^ {4}needs: changes$/mu);
    for (const script of ['typecheck', 'lint', 'format:check', 'arch', 'deadcode']) {
      expect(gates).toContain(`run: npm run ${script}`);
    }
    // The tests job does not wait for the gates and does not repeat them.
    expect(tests).not.toMatch(/needs:.*gates/u);
    for (const script of ['typecheck', 'lint', 'arch', 'deadcode']) {
      expect(tests).not.toContain(`run: npm run ${script}`);
    }
  });
});

describe('GitHub Actions workflows: required check names', () => {
  it('P1-177 P1-178 the required checks verify (ubuntu-latest) and verify (windows-latest) aggregate the tests and the gates', async () => {
    const verify = await ciJob('verify');

    expect(verify).toContain('name: verify (${{ matrix.os }})');
    expect(verify).toContain('os: [ubuntu-latest, windows-latest]');
    expect(verify).toContain('needs: [gates, tests-shard, tests]');
    expect(verify).toContain('if: always()');
    expect(verify).toContain('SHARDS: ${{ needs.tests-shard.result }}');
    expect(verify).toContain('test "$SHARDS" = success');
    expect(verify).toContain('TESTS: ${{ needs.tests.result }}');
    expect(verify).toContain('GATES: ${{ needs.gates.result }}');
    expect(verify).toContain('test "$TESTS" = success');
    expect(verify).toContain('test "$GATES" = success');
  });

  it('P1-177 the check names of the ruleset are all still reported by a workflow', async () => {
    const required = [
      'verify (ubuntu-latest)',
      'verify (windows-latest)',
      'e2e',
      'audit',
      'gitleaks',
      'dependency-review',
      'pr-title',
      'codeql',
    ];
    const names = (await load()).flatMap((workflow) =>
      workflow.lines.flatMap((line) => {
        const match = /^\s+name: (.+)$/u.exec(line);
        return match?.[1] === undefined ? [] : [match[1].replace(/^['"]|['"]$/gu, '')];
      }),
    );
    const expanded = names.flatMap((name) =>
      name.includes('${{ matrix.os }}')
        ? ['ubuntu-latest', 'windows-latest'].map((os) => name.replace('${{ matrix.os }}', os))
        : [name],
    );

    for (const check of required) {
      expect(expanded.map((name) => name.toLowerCase())).toContain(check);
    }
  });
});

// P1-178: the unit, web and integration tests run in shards on both operating systems; a merge job
// enforces the coverage thresholds on the merged blob reports.
const root = process.cwd();
const scripts = async (): Promise<Record<string, string>> =>
  (JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { scripts: never }).scripts;

describe('GitHub Actions workflows: test shards', () => {
  it('P1-178 the tests run in three shards on each operating system, the Linux ones with a PostgreSQL service', async () => {
    const shard = await ciJob('tests-shard');
    const list = /^ {8}shard: \[(.+)\]$/mu.exec(shard)?.[1] ?? '';

    expect(shard).toMatch(/^ {4}needs: changes$/mu);
    expect(shard).toContain('os: [ubuntu-latest, windows-latest]');
    expect(list.split(',').map((entry) => entry.trim())).toEqual(['1', '2', '3']);
    // The shard count of the command equals the length of the matrix list.
    expect(shard).toContain('"--shard=$SHARD/3"');
    expect(shard).toContain('image: postgres:17');
    expect(shard).toContain('services: ${{ matrix.services }}');
    expect(shard).toContain("ROSETTA_E2E_OWN_JOB: '1'");
    expect(shard).toContain('ROSETTA_TEST_DATABASE_URL: ${{ matrix.database-url }}');
    expect(shard).toContain('run: npm run test:shard');
    expect(shard).toMatch(/^ {4}timeout-minutes: \d+$/mu);
    expect(shard).not.toMatch(/^ {4}if:/mu);
  });

  it('P1-178 a shard turns the coverage thresholds off and uploads its blob report, the merge job never does', async () => {
    const shard = await ciJob('tests-shard');
    const merge = await ciJob('tests');

    expect(shard).toContain("ROSETTA_COVERAGE_SHARD: '1'");
    expect(shard).toContain('actions/upload-artifact@');
    expect(shard).toContain('name: blob-${{ matrix.os }}-${{ matrix.shard }}');
    expect(merge).not.toContain('ROSETTA_COVERAGE_SHARD');
    expect(merge).not.toContain('run: npm run test:shard');
  });

  it('P1-178 the tests job merges the blob reports of its operating system and enforces the coverage', async () => {
    const merge = await ciJob('tests');

    expect(merge).toMatch(/^ {4}needs: \[changes, tests-shard\]$/mu);
    expect(merge).toContain('actions/download-artifact@');
    expect(merge).toContain('pattern: blob-${{ matrix.os }}-*');
    expect(merge).toContain('merge-multiple: true');
    expect(merge).toContain('run: npm run test:merge');
    expect(merge).not.toContain('run: npm run test:ci');
    // A missing blob would drop tests silently: the merge checks that all three shards reported.
    expect(merge).toContain("-name 'blob-*.json' | wc -l)\" -eq 3");
    expect(merge).not.toMatch(/^ {4}if:/mu);
  });
});

describe('GitHub Actions workflows: test merge', () => {
  it('P1-178 the merge keeps the thresholds of the unsharded run and prints the pyramid from the merged report', async () => {
    const all = await scripts();
    const config = (await readFile(join(root, 'vitest.config.ts'), 'utf8')).replaceAll(
      '\r\n',
      '\n',
    );

    expect(all['test:shard']).toContain('--coverage');
    expect(all['test:shard']).toContain('--reporter=blob');
    expect(all['test:merge']).toContain('--merge-reports=test-results/blob');
    expect(all['test:merge']).toContain('--coverage');
    expect(all['test:merge']).toContain('--reporter=json');
    expect(all['test:merge']).toContain(
      'node scripts/test-levels.mjs --report test-results/vitest.json',
    );
    // The numbers of the thresholds did not change, and only a shard run (the variable) skips them.
    expect(config).toContain("lines: 80,\n  'src/domain/**': { lines: 90, branches: 85 },");
    expect(config).toContain("'src/application/**': { lines: 90, branches: 85 },");
    expect(config).toContain("process.env['ROSETTA_COVERAGE_SHARD'] === '1'");
    expect(config).toContain('...(shardRun ? {} : { thresholds })');
    // The local verify still runs the whole suite in one process.
    expect(all['test:ci']).toContain('vitest run --coverage');
  });

  it('P1-178 the third-party actions of the shard and merge jobs are pinned to a commit', async () => {
    const text = [await ciJob('tests-shard'), await ciJob('tests')].join('\n');
    const uses = [...text.matchAll(/uses: (\S+)/gu)].map((match) => match[1] ?? '');

    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) expect(action).toMatch(/@[0-9a-f]{40}$/u);
  });
});
