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
  violations,
  workflowText,
} from '../../support/workflow-files.js';

// Workflow hardening rules of environments-and-delivery.md section 6 and the hard-rule greps of
// docs/orchestration/README.md section 5.1. Workflows are checked as text: no YAML parser is in the
// package baseline.

describe('GitHub Actions workflows: files', () => {
  it('RNF-001 ships the CI, CodeQL and pull request title workflows and Dependabot configuration', async () => {
    const names = (await load()).map((workflow) => workflow.name);
    const dependabot = await readFile(join(process.cwd(), '.github', 'dependabot.yml'), 'utf8');

    expect(names).toEqual(['ci.yml', 'codeql.yml', 'pr-title.yml']);
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
  });

  it('RNF-001 the CI workflow runs verify on ubuntu and windows with a PostgreSQL 17 service on Linux', async () => {
    const text = await ci();

    expect(text).toContain('ubuntu-latest');
    expect(text).toContain('windows-latest');
    expect(text).toContain('image: postgres:17');
    expect(text).toContain('ROSETTA_TEST_DATABASE_URL');
    expect(text).toContain('node-version-file: .nvmrc');
    expect(text).toContain('run: npm run verify');
  });

  it('RNF-001 Linux runs every gate of verify and Windows runs only the tests', async () => {
    const text = await ci();

    expect(text).toMatch(/if: runner\.os == 'Linux'[^\n]*\n\s+run: npm run verify\n/u);
    expect(text).toMatch(/if: runner\.os == 'Windows'[^\n]*\n\s+run: npm run test:ci\n/u);
    expect(text).not.toMatch(/if: runner\.os == 'Windows'[^\n]*\n\s+run: npm run verify/u);
    expect(text).toContain('name: verify (${{ matrix.os }})');
  });

  it('RNF-005 the e2e shards install Chromium before Playwright runs, and verify does not', async () => {
    const shard = await ciJob('e2e-shard');
    const install = shard.indexOf('npx playwright install --with-deps chromium');

    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(shard.indexOf('node scripts/run-e2e.mjs'));
    // verify skips the Playwright project (ROSETTA_E2E_OWN_JOB=1), so it needs no browser.
    expect(await ciJob('verify')).not.toContain('playwright install');
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

  it('RNF-003 uses no pull_request_target trigger and no secrets', async () => {
    const found = await violations(({ lines }) => {
      const code = lines.filter((line) => !line.trimStart().startsWith('#')).join('\n');
      return [
        ...(code.includes('pull_request_target') ? ['pull_request_target'] : []),
        ...(code.includes('secrets.') ? ['secrets context'] : []),
      ];
    });

    expect(found).toEqual([]);
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

  it('RNF-001 every workflow has a concurrency group per branch that cancels superseded runs', async () => {
    const found = await violations(({ lines }) =>
      /^concurrency:\n {2}group: .*github\.ref.*\n {2}cancel-in-progress: true$/mu.test(
        lines.join('\n'),
      )
        ? []
        : ['concurrency'],
    );

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

    expect(dependabot.match(/cooldown:\n\s+default-days: 14\n/gu) ?? []).toHaveLength(2);
  });
});
