import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// DEC-175, ADR-025: the documents of the develop -> staging -> scheduled release flow. A missing
// file reads as empty so the checks fail on their assertions.
const read = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), 'utf8').catch(() => '');

/** The text of one Markdown section that starts with `marker` (a heading), up to the next one. */
function section(markdown: string, marker: string): string {
  const start = markdown.indexOf(`\n${marker}`);
  if (start < 0) return '';
  const level = /^#+ /u.exec(marker)?.[0] ?? '## ';
  const next = markdown.indexOf(`\n${level}`, start + 1);
  return markdown.slice(start, next < 0 ? undefined : next);
}

describe('DEC-175 in the decision log and the ADR index', () => {
  it('DEC-175 has its row with the date, the reason and the new workflows', async () => {
    const row = (await read('docs/decision-log.md'))
      .split('\n')
      .find((line) => line.startsWith('| DEC-175 '));

    expect(row).toContain('2026-10-27');
    expect(row).toContain('teachers can sign in');
    expect(row).toContain('staging.yml');
    expect(row).toContain('scheduled-release.yml');
    expect(row).toContain('ADR-025');
  });
});

describe('docs/runbooks/deploy.md: staging and release (DEC-175)', () => {
  it('DEC-175 the Staging section lists the owner steps: environment, secrets, credential, provision, smoke account, switch', async () => {
    const text = section(await read('docs/runbooks/deploy.md'), '## Staging');

    for (const fact of [
      'Settings, Environments',
      '`develop`',
      'repo:blacklight0101/Rosetta:environment:staging',
      'az ad app federated-credential create',
      '`ROSETTA_SECRET_KEY`',
      '`ROSETTA_ADMIN_USER`',
      '`ROSETTA_ADMIN_PASSWORD`',
      '`ROSETTA_GITHUB_TOKEN`',
      'target `staging`',
      '`ROSETTA_PUBLIC_URL`',
      '`ROSETTA_SMOKE_USER`',
      '`ROSETTA_SMOKE_PASSWORD`',
      '`ROSETTA_STAGING_ENABLED`',
    ]) {
      expect(text).toContain(fact);
    }
    expect(text).toMatch(/new value/iu);
  });

  it('DEC-175 the Release to production section covers the pull request, the merge commit, 06:07 with backups until 07:59, deploying now and the skip', async () => {
    const text = section(await read('docs/runbooks/deploy.md'), '## Release to production');

    for (const fact of [
      'merge commit',
      '06:07',
      'backups until 07:59',
      'scheduled-release.yml',
      'Run workflow, branch `main`',
      'skip-staging-check',
      'Rollback',
    ]) {
      expect(text).toContain(fact);
    }
  });
});

describe('the staging check while staging is off (DEC-175)', () => {
  it('DEC-175 the runbook, the delivery document and ADR-025 say the check waits for ROSETTA_STAGING_ENABLED', async () => {
    const files = [
      'docs/runbooks/deploy.md',
      'docs/environments-and-delivery.md',
      'docs/adr/ADR-025-develop-branch-staging-and-scheduled-release.md',
    ];

    for (const file of files) {
      expect(await read(file)).toMatch(
        /`ROSETTA_STAGING_ENABLED`[^.]*(?:not `true`|is not true)[^.]*skipped/u,
      );
    }
  });
});

describe('docs/environments-and-delivery.md and the threat model (DEC-175)', () => {
  it('DEC-175 names the staging environment, develop as default branch and both rulesets', async () => {
    const text = await read('docs/environments-and-delivery.md');
    const branching = section(text, '## 5. Source control and branching');

    expect(section(text, '## 1. Environments')).toContain('**Staging**');
    expect(branching).toContain('default branch `develop`');
    expect(branching).toMatch(/`main`[^\n]*merge commits only/u);
    expect(branching).toMatch(/`develop`[^\n]*squash only/u);
  });

  it('DEC-175 the threat model lists the shared database roles of staging', async () => {
    const risks = section(await read('docs/security/threat-model.md'), '## 6. Residual risks');

    expect(risks).toContain('staging');
    expect(risks).toContain('rosetta_app');
  });
});

describe('ADR-028, the on-time start of the production deploy (DEC-207)', () => {
  const adr028 = 'docs/adr/ADR-028-on-time-release-start-from-a-container-apps-job.md';

  it('DEC-207 ADR-028 is Proposed, weighs the options, names the token limits and its rotation, and never names an employer', async () => {
    const text = await read(adr028);

    expect(text).toMatch(/^# ADR-028: /u);
    expect(text).toContain('**Status**: Proposed');
    for (const fact of [
      'Container Apps job',
      'Logic App',
      'managed identity',
      '04:00 and 05:00 UTC',
      'Europe/Madrid',
      'workflow_dispatch',
      'fine-grained',
      'Actions',
      'secret of the job',
      'rotation',
      'Do nothing',
      'DEC-207',
      'Q-63',
      'ADR-024',
      'ADR-025',
    ]) {
      expect(text).toContain(fact);
    }
    expect(text).not.toMatch(/mission\s*foods/iu);
  });

  it('DEC-207 the ADR index lists ADR-028 as Proposed and the Totals line counts it', async () => {
    const index = await read('docs/adr/README.md');
    const row = index.split('\n').find((line) => line.startsWith('| [ADR-028]'));

    expect(row).toContain('Proposed');
    expect(row).toContain('2026-11-04');
    expect(index).toMatch(/\*\*Totals\*\*: 29 in total/u);
    expect(index).toMatch(/ADR-028 \(Proposed\)/u);
  });
});

describe('the 06:00 start in ADR-025 and RF-1304 (DEC-207)', () => {
  it('DEC-207 ADR-025 stays Amended and carries a dated note for 06:00 Madrid with the checks before it', async () => {
    const text = await read('docs/adr/ADR-025-develop-branch-staging-and-scheduled-release.md');
    const note = text.slice(text.indexOf('**Amended 2026-11-04'));

    expect(text).toContain('**Status**: Amended');
    expect(note).toContain('06:00');
    expect(note).toContain('Europe/Madrid');
    expect(note).toContain('before');
    expect(note).toContain('ADR-028 (Proposed) chooses the scheduler');
    expect(note).toContain('DEC-207');
    expect(note).toContain('the 06:07 slots stay in force');
  });

  it('DEC-207 RF-1304 has the Given/When/Then for the checks before 06:00 and for the 06:00 start', async () => {
    const requirements = await read('docs/spec/requirements.md');
    const start = requirements.indexOf('**RF-1304 Hosted deployment**');
    const block = requirements.slice(start, requirements.indexOf('**RF-1305', start));

    for (const fact of [
      'pushed to `main`',
      'builds, scans and pushes the image',
      'ZAP baseline',
      'staging check',
      '06:00 Europe/Madrid',
      'restore point',
      'smoke test',
      'all of its checks passed',
      '"Production deploys"',
      'nothing deploys',
    ]) {
      expect(block).toContain(fact);
    }
  });
});

describe('the checks workflow of the release merge in the delivery documents (DEC-207, P8-63)', () => {
  it('DEC-207 docs/environments-and-delivery.md names release-checks.yml, its trigger, its job permissions and its token', async () => {
    const text = section(
      await read('docs/environments-and-delivery.md'),
      '## 6. Continuous integration',
    );

    for (const fact of [
      '`release-checks.yml`',
      'every push to `main`',
      '`contents: read`, `checks: read`, `packages: write`, `statuses: write` and `issues: write`',
      'workflow token',
    ]) {
      expect(text).toContain(fact);
    }
  });

  it('DEC-207 the deploy runbook lists the checks workflow with its test and says the release merge gets its image at once', async () => {
    const text = await read('docs/runbooks/deploy.md');
    const row = text
      .split('\n')
      .find((line) => line.includes('`.github/workflows/release-checks.yml`'));
    const release = section(text, '## Release to production');

    expect(row).toContain('`tests/integration/tooling/release-checks-workflow.test.ts`');
    expect(release).toContain('`release-checks.yml`');
    expect(release).toContain('sha-<short>');
  });
});

describe('release/ready in the delivery documents (DEC-207, P8-64)', () => {
  it('DEC-207 docs/environments-and-delivery.md says the checks workflow confirms ZAP and staging and records release/ready', async () => {
    const text = await read('docs/environments-and-delivery.md');

    for (const fact of ['`release/ready`', '`zap-baseline`', 'ROSETTA_STAGING_ENABLED']) {
      expect(section(text, '## 6. Continuous integration')).toContain(fact);
    }
    expect(section(text, '## 8.')).toContain('`release/ready`');
  });

  it('DEC-207 the deploy runbook says what release/ready on the release merge means and lists its tests', async () => {
    const text = await read('docs/runbooks/deploy.md');
    const release = section(text, '## Release to production');

    expect(release).toContain('`release/ready`');
    expect(release).toMatch(/`failure`[^\n]*names/u);
    expect(text).toContain('`tests/integration/tooling/release-checks-ready.test.ts`');
    expect(text).toContain('`tests/integration/tooling/release-ready-status.test.ts`');
  });
});

describe('the facts of ADR-028 the provisioning rests on (DEC-207, P8-138)', () => {
  it('DEC-207 ADR-028 names the one cron schedule, the Madrid hour guard, the token expiry and what the token reaches', async () => {
    // P8-138: the facts the provisioning step and the rotation rest on.
    const text = await read('docs/adr/ADR-028-on-time-release-start-from-a-container-apps-job.md');
    const flat = text.replaceAll(/\s+/gu, ' ');

    for (const fact of [
      'one cron schedule that fires at 04:00 and 05:00 UTC',
      'the hour in Europe/Madrid is 06',
      'expires after 90 days',
      'start and cancel workflow runs and read their logs and artifacts',
      '7 h 06 min',
    ]) {
      expect(flat).toContain(fact);
    }
  });
});
