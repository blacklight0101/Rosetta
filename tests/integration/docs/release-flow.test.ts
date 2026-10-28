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
