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
  it('P1-177 the required checks verify (ubuntu-latest) and verify (windows-latest) aggregate the tests and the gates', async () => {
    const verify = await ciJob('verify');

    expect(verify).toContain('name: verify (${{ matrix.os }})');
    expect(verify).toContain('os: [ubuntu-latest, windows-latest]');
    expect(verify).toContain('needs: [gates, tests]');
    expect(verify).toContain('if: always()');
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
