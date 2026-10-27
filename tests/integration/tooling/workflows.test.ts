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
  it('RNF-001 ships the Azure provision, CI, CodeQL, Pages, pull request title, release, scheduled release and staging workflows and Dependabot configuration', async () => {
    const names = (await load()).map((workflow) => workflow.name);
    const dependabot = await readFile(join(process.cwd(), '.github', 'dependabot.yml'), 'utf8');

    expect(names).toEqual([
      'azure-provision.yml',
      'ci.yml',
      'codeql.yml',
      'pages.yml',
      'pr-title.yml',
      'release.yml',
      'scheduled-release.yml',
      'staging.yml',
    ]);
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
  });

  it('RNF-001 the CI workflow runs the tests on ubuntu and windows with a PostgreSQL 17 service on Linux', async () => {
    const text = await ciJob('tests-shard');

    expect(text).toContain('ubuntu-latest');
    expect(text).toContain('windows-latest');
    expect(text).toContain('image: postgres:17');
    expect(text).toContain('ROSETTA_TEST_DATABASE_URL');
    expect(text).toContain('node-version-file: .nvmrc');
    expect(text).toContain('run: npm run test:shard');
    expect(text).not.toContain('run: npm run verify');
  });

  it('RNF-005 the e2e shards install Chromium before Playwright runs, and the tests job does not', async () => {
    const shard = await ciJob('e2e-shard');
    const install = shard.indexOf('npx playwright install chromium');

    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(shard.indexOf('node scripts/run-e2e.mjs'));
    // The tests job skips the Playwright project (ROSETTA_E2E_OWN_JOB=1), so it needs no browser.
    expect(await ciJob('tests-shard')).not.toContain('playwright install');
  });

  it('DEC-35 the pull request title reaches commitlint through env: TITLE', async () => {
    const text = await workflowText('pr-title.yml');

    expect(text).toContain('TITLE: ${{ github.event.pull_request.title }}');
    expect(text).toContain('"$TITLE"');
  });
});

describe('GitHub Actions workflows: Chromium install (P1-183)', () => {
  it.each(['e2e-shard', 'compose-smoke'])(
    'P1-183 %s installs Chromium fast: cached browsers, no apt on the usual path, a short step timeout',
    async (id) => {
      const text = await ciJob(id);
      const from = text.indexOf('- name: Install Chromium');
      const step = text.slice(from, text.indexOf('\n      - ', from + 1));

      // The apt mirror stalled for 10 minutes on PR #800; `--with-deps` runs apt on every call.
      expect(step).not.toContain('--with-deps');
      expect(step).toMatch(/timeout-minutes: [1-5]\n/u);
      // System packages only when Chromium cannot start without them.
      expect(step).toContain('npx playwright install chromium');
      expect(step).toMatch(/\.launch\(\)[\s\S]*npx playwright install-deps chromium/u);
      // The browser folder is cached, keyed on the Playwright version of the lockfile.
      expect(text).toContain('path: ~/.cache/ms-playwright');
      expect(text).toMatch(
        /key: playwright-\$\{\{ runner\.os \}\}-\$\{\{ steps\.playwright-version\.outputs\.version \}\}/u,
      );
      expect(text).toMatch(/uses: actions\/cache@[0-9a-f]{40} # v\d+\.\d+\.\d+/u);
      // The job limit stays.
      expect(text).toMatch(/\n {4}timeout-minutes: (15|20)\n/u);
    },
  );
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
  // DEC-175: develop is the integration branch, main is what is deployed; both are checked on push.
  it('RNF-001 push runs only on main and develop so a pull request commit is not built twice', async () => {
    expect(await ci()).toMatch(/^ {2}push:\n {4}branches: \[main, develop\]$/mu);
  });

  it('DEC-175 CodeQL also runs on a push to main and to develop', async () => {
    expect(await workflowText('codeql.yml')).toMatch(
      /^ {2}push:\n {4}branches: \[main, develop\]$/mu,
    );
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

    // scheduled-release.yml (DEC-175) only calls gh with the job token: it needs no action.
    const withoutActions = ['scheduled-release.yml'];

    const found = await violations(({ name, lines }) => {
      const uses = lines.filter((line) => /^\s*(?:- )?uses:/u.test(line));
      return [
        ...(uses.length === 0 && !withoutActions.includes(name) ? ['no uses: line'] : []),
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

  // release.yml (P1-55), azure-provision.yml (P1-184) and staging.yml (DEC-175) queue instead:
  // cancelling a release, a staging deploy or a provisioning half-way could leave a pushed tag
  // without its image, a deploy half done or a resource half made. azure-provision.yml has one
  // group for every branch (DEC-175): its production run (main) and its staging run (develop) both
  // converge the one shared PostgreSQL server, so they must never overlap.
  it('RNF-001 every workflow has a concurrency group per branch (provision: one for all); all but the release, staging and provision workflows cancel superseded runs', async () => {
    const queued = ['release.yml', 'azure-provision.yml', 'staging.yml'];
    const found = await violations(({ name, lines }) => {
      const cancel = queued.includes(name) ? 'false' : 'true';
      const group = name === 'azure-provision.yml' ? 'azure-provision' : '.*github\\.ref.*';
      const pattern = new RegExp(
        `^concurrency:\n {2}group: ${group}\n {2}cancel-in-progress: ${cancel}$`,
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

    expect(text).toContain('npx playwright install chromium');
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
