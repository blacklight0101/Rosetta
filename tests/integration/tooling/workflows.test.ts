import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ci,
  ciJob,
  jobIds,
  jobs,
  load,
  runLines,
  triggerAndSecretProblems,
  violations,
  workflowText,
} from '../../support/workflow-files.js';

// Workflow hardening rules of environments-and-delivery.md section 6 and the hard-rule greps of
// docs/orchestration/README.md section 5.1. Workflows are checked as text: no YAML parser is in the
// package baseline.

describe('GitHub Actions workflows: files', () => {
  it('RNF-001 ships the CI, CodeQL, Pages, pull request title and release workflows and Dependabot configuration', async () => {
    const names = (await load()).map((workflow) => workflow.name);
    const dependabot = await readFile(join(process.cwd(), '.github', 'dependabot.yml'), 'utf8');

    expect(names).toEqual(['ci.yml', 'codeql.yml', 'pages.yml', 'pr-title.yml', 'release.yml']);
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
  });

  it('RNF-001 the CI workflow runs the tests on ubuntu and windows with a PostgreSQL 17 service on Linux', async () => {
    const text = await ciJob('tests');

    expect(text).toContain('ubuntu-latest');
    expect(text).toContain('windows-latest');
    expect(text).toContain('image: postgres:17');
    expect(text).toContain('ROSETTA_TEST_DATABASE_URL');
    expect(text).toContain('node-version-file: .nvmrc');
    expect(text).toContain('run: npm run test:ci');
    expect(text).not.toContain('run: npm run verify');
  });

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

  it('P1-177 the required checks verify (ubuntu-latest) and verify (windows-latest) aggregate the tests and the gates', async () => {
    const verify = await ciJob('verify');

    expect(verify).toContain('name: verify (${{ matrix.os }})');
    expect(verify).toMatch(/^ {8}os: [ubuntu-latest, windows-latest]$/mu);
    expect(verify).toMatch(/^ {4}needs: [gates, tests]$/mu);
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
        const match = /^s+name: (.+)$/u.exec(line);
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

  it('RNF-005 the e2e shards install Chromium before Playwright runs, and the tests job does not', async () => {
    const shard = await ciJob('e2e-shard');
    const install = shard.indexOf('npx playwright install --with-deps chromium');

    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(shard.indexOf('node scripts/run-e2e.mjs'));
    // The tests job skips the Playwright project (ROSETTA_E2E_OWN_JOB=1), so it needs no browser.
    expect(await ciJob('tests')).not.toContain('playwright install');
  });

  it('DEC-35 the pull request title reaches commitlint through env: TITLE', async () => {
    const text = await workflowText('pr-title.yml');

    expect(text).toContain('TITLE: ${{ github.event.pull_request.title }}');
    expect(text).toContain('"$TITLE"');
  });
});

describe('GitHub Actions workflows: e2e shards', () => {
  it('RNF-005 the e2e project runs in three shards, and the matrix, the name and the step agree', async () => {
    const shard = await ciJob('e2e-shard');

    expect(shard).toContain('shard: [1, 2, 3]');
    expect(shard).toContain('name: e2e (shard ${{ matrix.shard }}/3)');
    expect(shard).toContain('run: node scripts/run-e2e.mjs "--shard=$SHARD/3"');
  });
});

describe('GitHub Actions workflows: triggers', () => {
  it('RNF-001 push runs only on main so a pull request commit is not built twice', async () => {
    expect(await ci()).toMatch(/^ {2}push:\n {4}branches: \[main\]$/mu);
  });
});

describe('GitHub Actions workflows: edited pull requests', () => {
  // A job skipped by an if: on an edited event reports "skipped", which a required check counts as
  // passed and which would replace the result of the same commit. So ci.yml does not listen for
  // edited at all, and the title check, the only job an edit needs, has its own workflow.
  const types = (text: string): string[] =>
    (/^ {4}types: \[([^\]]*)\]$/mu.exec(text)?.[1] ?? '').split(', ');

  it('RNF-001 an edit of a pull request runs only the pr-title check', async () => {
    expect(types(await ci())).toEqual(['opened', 'synchronize', 'reopened']);
    expect(types(await workflowText('pr-title.yml'))).toEqual([
      'opened',
      'synchronize',
      'reopened',
      'edited',
    ]);
  });

  it('RNF-001 the pr-title job is named pr-title, the name the ruleset matches', async () => {
    expect(await workflowText('pr-title.yml')).toMatch(/^ {4}name: pr-title$/mu);
  });

  it('RNF-001 the pr-title check is reported by its own workflow and not by ci.yml', async () => {
    expect(await jobIds('ci.yml')).not.toContain('pr-title');
    expect(await jobIds('pr-title.yml')).toEqual(['pr-title']);
  });
});

describe('GitHub Actions workflows: hardening', () => {
  it('RNF-003 every uses: line pins a full 40-character commit SHA with a version comment', async () => {
    const pinned = /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+\s*$/u;

    const found = await violations(({ lines }) => {
      const uses = lines.filter((line) => /^\s*(?:- )?uses:/u.test(line));
      return [
        ...(uses.length === 0 ? ['no uses: line'] : []),
        ...uses.filter((line) => !pinned.test(line)).map((line) => line.trim()),
      ];
    });

    expect(found).toEqual([]);
  });

  it('RNF-003 no ${{ }} expression appears inside a run: block', async () => {
    const found = await violations(({ lines }) =>
      runLines(lines).filter((line) => line.includes('${{')),
    );

    expect(found).toEqual([]);
  });

  it('RNF-003 top-level permissions are contents: read', async () => {
    const found = await violations(({ lines }) => {
      const top = lines.indexOf('permissions:');
      return top >= 0 && lines[top + 1] === '  contents: read' ? [] : ['top-level permissions'];
    });

    expect(found).toEqual([]);
  });
});

describe('GitHub Actions workflows: secrets', () => {
  // The one exception is the deploy job of release.yml (P1-55, DEC-104): it reads the secrets of
  // the `production` environment, which the owner creates at gate G-07.
  it('RNF-003 uses no pull_request_target trigger and no secrets outside the deploy job of release.yml', async () => {
    expect(await violations(triggerAndSecretProblems)).toEqual([]);
  });

  it.each([
    ['a top-level env after the last job', ['env:', '  TOKEN: ${{ secrets.X }}']],
    ['a top-level env before the jobs', []],
    ['another job after deploy', ['  other:', '    env:', '      TOKEN: ${{ secrets.X }}']],
  ])('RNF-003 the secrets rule catches %s in release.yml', (_label, tail) => {
    const head = ['name: Release', 'env:', '  A: ${{ secrets.Y }}'];
    const lines = [
      ...(tail.length === 0 ? head : ['name: Release']),
      'jobs:',
      '  deploy:',
      '    env:',
      '      OK: ${{ secrets.RAILWAY_TOKEN }}',
      ...tail,
    ];

    expect(triggerAndSecretProblems({ name: 'release.yml', lines })).toEqual(['secrets context']);
  });

  it('RNF-003 the secrets rule allows secrets inside the deploy job of release.yml only', () => {
    const lines = ['name: Release', 'jobs:', '  deploy:', '    env:', '      A: ${{ secrets.X }}'];

    expect(triggerAndSecretProblems({ name: 'release.yml', lines })).toEqual([]);
    expect(triggerAndSecretProblems({ name: 'ci.yml', lines })).toEqual(['secrets context']);
  });
});

describe('GitHub Actions workflows: no lint cache', () => {
  // ESLint's cache keys a file on its own content, but the type-aware rules also read the files it
  // imports, so a cached "clean" can hide a new error (environments-and-delivery.md section 6).
  it('RNF-001 lint runs in full, without a cache, locally and in CI', async () => {
    const manifest = await readFile(join(process.cwd(), 'package.json'), 'utf8');

    expect(manifest).toContain('"lint": "eslint . --max-warnings 0"');
    expect(await ci()).not.toContain('--cache');
  });
});

describe('GitHub Actions workflows: limits', () => {
  it('DEC-35 the audit job gets today as its date', async () => {
    expect(await ciJob('audit')).toContain('--today "$(date -u +%F)"');
  });

  it('RNF-001 every job has a timeout-minutes', async () => {
    const found = await violations(({ lines }) =>
      jobs(lines)
        .filter((job) => !job.body.some((line) => /^ {4}timeout-minutes: \d+$/u.test(line)))
        .map((job) => job.id),
    );

    expect(found).toEqual([]);
  });

  // release.yml (P1-55) queues instead: cancelling a release half-way could leave a pushed tag
  // without its image or a deploy half done.
  it('RNF-001 every workflow has a concurrency group per branch; all but release.yml cancel superseded runs', async () => {
    const found = await violations(({ name, lines }) => {
      const cancel = name === 'release.yml' ? 'false' : 'true';
      const pattern = new RegExp(
        `^concurrency:\n {2}group: .*github\\.ref.*\n {2}cancel-in-progress: ${cancel}$`,
        'mu',
      );
      return pattern.test(lines.join('\n')) ? [] : ['concurrency'];
    });

    expect(found).toEqual([]);
  });
});

describe('GitHub Actions workflows: compose smoke job', () => {
  const stack = 'docker compose -f compose.yaml -f compose.ci.yaml';

  const smoke = (): Promise<string> => ciJob('compose-smoke');

  it('RF-1301 starts the stack with the CI overlay and waits for /healthz', async () => {
    const text = await smoke();

    expect(text).toContain('runs-on: ubuntu-latest');
    expect(text).toContain(`${stack} up -d --build --wait`);
    expect(text).toContain('/healthz');
  });

  it('RF-1301 runs the Playwright smoke before and after a restart of the stack, then removes the volumes', async () => {
    const text = await smoke();
    const before = text.indexOf('--config=playwright.compose.config.ts smoke');
    const restart = text.indexOf(`${stack} down\n`);
    const after = text.indexOf('--config=playwright.compose.config.ts persistence');
    const cleanup = text.indexOf('down -v');

    expect(before).toBeGreaterThan(-1);
    expect(restart).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(restart);
    expect(cleanup).toBeGreaterThan(after);
  });

  it('RNF-003 removes the stack and its volumes even when a step failed, and writes the .env at run time', async () => {
    const text = await smoke();

    expect(text).toMatch(/if: always\(\)[^\n]*\n\s+run: docker compose [^\n]*down -v/u);
    expect(text).toContain('openssl rand');
    expect(text).toContain('> .env');
  });

  it('RNF-005 installs Chromium for the smoke and has a timeout', async () => {
    const text = await smoke();

    expect(text).toContain('npx playwright install --with-deps chromium');
    expect(text).toMatch(/timeout-minutes: \d+/u);
  });
});

describe('Dependabot configuration', () => {
  it('DEC-125 Dependabot waits two weeks before it proposes a new version', async () => {
    const dependabot = await readFile(join(process.cwd(), '.github', 'dependabot.yml'), 'utf8');

    expect(dependabot.match(/cooldown:\n\s+default-days: 14\n/gu) ?? []).toHaveLength(3);
  });

  it('P2-17 Dependabot leaves the Anthropic SDK pin to its card', async () => {
    const dependabot = await readFile(join(process.cwd(), '.github', 'dependabot.yml'), 'utf8');

    expect(dependabot).toMatch(/- dependency-name: '@anthropic-ai\/sdk'\n/u);
  });
});
