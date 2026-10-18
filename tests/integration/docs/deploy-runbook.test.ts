import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// RF-1304, RF-1306, RF-1107, RNF-017, ADR-020, environments-and-delivery.md sections 10-12 and 14,
// P1-55: the hosted deployment runbook. Every step that needs the host is marked "Pending G-07"
// until the owner opens that gate. A missing file reads as empty so the checks fail on their
// assertions.
const read = (): Promise<string> =>
  readFile(new URL('../../../docs/runbooks/deploy.md', import.meta.url), 'utf8').catch(() => '');

/** The text of one `## ` section, up to the next one. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`);
  if (start < 0) return '';
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

const sections = [
  'Before the host exists',
  'Owner checklist for the day the host is bought',
  'Release and image',
  'Deploy',
  'Smoke test',
  'Rollback',
  'Backup',
  'Restore',
  'Roles in the host console',
  'Teacher account',
  'RNF-017 measurement',
  'Deployment record',
];

describe('docs/runbooks/deploy.md', () => {
  it('RF-1304 has a section for every part of the hosted deployment', async () => {
    const text = await read();

    for (const heading of sections) expect(section(text, heading)).not.toBe('');
  });

  it('RF-1304 marks every host-only section Pending G-07', async () => {
    const text = await read();

    for (const heading of [
      'Deploy',
      'Rollback',
      'Backup',
      'Restore',
      'Roles in the host console',
    ]) {
      expect(section(text, heading)).toContain('Pending G-07');
    }
  });

  it('ADR-020 the owner checklist has the ten steps of the ADR appendix, in order', async () => {
    const checklist = section(await read(), 'Owner checklist for the day the host is bought');
    const steps = checklist.split('\n').filter((line) => /^\d+\. /u.test(line));

    expect(steps).toHaveLength(10);
    expect(steps[0]).toContain('hard limit');
    expect(steps.join('\n')).toContain('RAILWAY_TOKEN');
    expect(steps.at(-1)).toContain('G-07');
  });
});

describe('docs/runbooks/deploy.md: settings and smoke test', () => {
  it('DEC-104 names the GitHub settings the deploy job needs and no value', async () => {
    const text = await read();

    for (const name of [
      'ROSETTA_DEPLOY_ENABLED',
      'RAILWAY_TOKEN',
      'ROSETTA_SMOKE_USER',
      'ROSETTA_SMOKE_PASSWORD',
      'ROSETTA_PUBLIC_URL',
      'production',
    ]) {
      expect(text).toContain(name);
    }
    expect(text).not.toMatch(/PASSWORD=[A-Za-z0-9]/u);
    expect(text).not.toMatch(/TOKEN=[A-Za-z0-9]/u);
  });

  it('RF-1304 runs the smoke script and checks the redirect with curl', async () => {
    const text = section(await read(), 'Smoke test');

    expect(text).toContain('node scripts/smoke.mjs');
    expect(text).toContain('curl');
    expect(text).toContain('http://');
  });
});

describe('docs/runbooks/deploy.md: deploy, backup, accounts and measurement', () => {
  it('RF-1302 DEC-140 runs the migrate step before the new image, with the migrator URL as its only secret', async () => {
    const text = section(await read(), 'Deploy');

    expect(text).toContain('node dist/presentation/migrate.js');
    expect(text).toContain('DATABASE_MIGRATOR_URL');
  });

  it('RF-1306 keeps a backup before each deploy and daily backups for 7 days, and records a restore drill', async () => {
    const text = await read();

    expect(section(text, 'Backup')).toContain('pg_dump');
    expect(section(text, 'Backup')).toContain('7 days');
    expect(section(text, 'Restore')).toContain('drill');
    expect(section(text, 'Backup')).toContain('ROSETTA_SECRET_KEY');
  });

  it('RF-1107 the teacher account is created without a forced password change and delivered only in the hand-in form', async () => {
    const text = section(await read(), 'Teacher account');

    expect(text).toContain('teacher');
    expect(text).toContain('mustChangePassword');
    expect(text).toContain('hand-in form');
    expect(text).toContain('defaultRoles');
  });

  it('RNF-017 documents the one-time measurement on the hosted URL', async () => {
    const text = section(await read(), 'RNF-017 measurement');

    expect(text).toContain('node scripts/measure-rnf017.mjs');
    expect(text).toContain('two runs');
    expect(text).toContain('Pending G-07');
  });
});
