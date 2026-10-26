import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// RF-1304, RF-1306, RF-1107, RNF-017, ADR-024, DEC-171, environments-and-delivery.md sections 10-12
// and 14, P1-55, P1-184: the hosted deployment runbook for Azure Container Apps. Running the
// workflows waits on gates G-07 and G-08, so every step that runs them is marked "Pending G-07". A
// missing file reads as empty so the checks fail on their assertions.
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
  'Owner steps done on 2026-10-24',
  'Environment secrets the owner adds',
  'Provisioning',
  'Release and image',
  'Deploy',
  'Smoke test',
  'Rollback',
  'Backup',
  'Restore',
  'Database roles',
  'Teacher account',
  'Cost check after day one',
  'RNF-017 measurement',
  'Deployment record',
];

describe('docs/runbooks/deploy.md', () => {
  it('RF-1304 has a section for every part of the hosted deployment', async () => {
    const text = await read();

    for (const heading of sections) expect(section(text, heading)).not.toBe('');
  });

  it('RF-1304 no section waits on G-07 once the first deployment has run (G-06, G-07)', async () => {
    expect(await read()).not.toContain('Pending G-07');
  });

  it('RF-1304 the deployment record holds the first deploy with its tag, smoke test and ZAP baseline', async () => {
    const text = section(await read(), 'Deployment record');

    expect(text).toContain('2026-10-24');
    expect(text).toMatch(/sha-[0-9a-f]{7}/u);
    expect(text).toMatch(/smoke[^\n]*passed/iu);
    expect(text).toMatch(/ZAP baseline[^\n]*High: 0/u);
    expect(text).toMatch(/\/healthz[^\n]*200/u);
    expect(text).toMatch(/301/u);
  });

  it('DEC-171 names the dropped host only in its one-line history note', async () => {
    const dropped = new RegExp(['rail', 'way'].join(''), 'iu');
    const lines = (await read()).split('\n').filter((line) => dropped.test(line));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('DEC-171');
  });
});

describe('docs/runbooks/deploy.md: owner steps and settings', () => {
  it('ADR-024 records the owner steps of 2026-10-24: subscription, budget, group, identity, variables', async () => {
    const text = section(await read(), 'Owner steps done on 2026-10-24');

    for (const fact of [
      'subscription',
      '25 USD',
      'rg-rosetta',
      'Spain Central',
      'repo:blacklight0101/Rosetta:environment:production',
      'Contributor',
      'AZURE_CLIENT_ID',
      'AZURE_TENANT_ID',
      'AZURE_SUBSCRIPTION_ID',
    ]) {
      expect(text).toContain(fact);
    }
  });

  it('RNF-003 lists the production secrets and variables the owner adds in the GitHub settings page, and no value', async () => {
    const text = section(await read(), 'Environment secrets the owner adds');

    for (const name of [
      'ROSETTA_SECRET_KEY',
      'ROSETTA_SECRET_KEY_PREVIOUS',
      'ROSETTA_ADMIN_USER',
      'ROSETTA_ADMIN_PASSWORD',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'ROSETTA_GITHUB_TOKEN',
      'ROSETTA_SMOKE_PASSWORD',
      'ROSETTA_SMOKE_USER',
      'ROSETTA_PUBLIC_URL',
      'ROSETTA_DEPLOY_ENABLED',
    ]) {
      expect(text).toContain(`\`${name}\``);
    }
    expect(text).toContain('Settings, Environments, production');
    expect(await read()).not.toMatch(/(?:PASSWORD|TOKEN|KEY)=[A-Za-z0-9]/u);
  });
});

describe('docs/runbooks/deploy.md: provisioning', () => {
  it('ADR-024 provisioning runs azure-provision.yml by hand and names what it creates', async () => {
    const text = section(await read(), 'Provisioning');

    for (const fact of [
      'azure-provision.yml',
      'Run workflow',
      'image-tag',
      'Log Analytics',
      'Azure Files',
      '/data',
      'PostgreSQL 17',
      'CanNotDelete',
      'az lock create',
    ]) {
      expect(text).toContain(fact);
    }
  });
});

describe('docs/runbooks/deploy.md: deploy, smoke test and rollback', () => {
  it('RF-1302 DEC-140 runs the migrate job before the new image, with the migrator URL as its only secret', async () => {
    const text = section(await read(), 'Deploy');

    expect(text).toContain('node dist/presentation/migrate.js');
    expect(text).toContain('DATABASE_MIGRATOR_URL');
    expect(text).toContain('az containerapp job start');
    expect(text).toContain('az containerapp update');
    expect(text.indexOf('az containerapp job start')).toBeLessThan(
      text.indexOf('az containerapp update'),
    );
  });

  it('RF-1304 runs the smoke script and checks the redirect with curl on the Container Apps host', async () => {
    const text = section(await read(), 'Smoke test');

    expect(text).toContain('node scripts/smoke.mjs');
    expect(text).toContain('curl');
    expect(text).toContain('http://');
    expect(text).toContain('<app>.<region>.azurecontainerapps.io');
  });

  it('ADR-024 rolls back by setting the previous image tag', async () => {
    const text = section(await read(), 'Rollback');

    expect(text).toContain('az containerapp update');
    expect(text).toContain('--image ghcr.io/blacklight0101/rosetta:<previous tag>');
  });
});

describe('docs/runbooks/deploy.md: backup, accounts and measurement', () => {
  it('RF-1306 keeps point-in-time restore for 7 days, the lock and the scheduled dump, and records a restore drill', async () => {
    const text = await read();
    const backup = section(text, 'Backup');

    expect(backup).toContain('point-in-time restore');
    expect(backup).toContain('7 days');
    expect(backup).toContain('CanNotDelete');
    expect(backup).toContain('npm run backup');
    expect(backup).toContain('pg_dump');
    expect(backup).toContain('ROSETTA_SECRET_KEY');
    expect(section(text, 'Restore')).toContain('az postgres flexible-server restore');
    expect(section(text, 'Restore')).toContain('drill');
  });

  it('DEC-140 the database roles are created by the provisioning job, not by hand', async () => {
    const text = section(await read(), 'Database roles');

    expect(text).toContain('rosetta_app');
    expect(text).toContain('rosetta_migrator');
    expect(text).toContain('azure-provision.yml');
    expect(text).toContain('openssl rand');
  });

  it('RF-1107 the teacher account is created without a forced password change and delivered only in the hand-in form', async () => {
    const text = section(await read(), 'Teacher account');

    expect(text).toContain('teacher');
    expect(text).toContain('mustChangePassword');
    expect(text).toContain('hand-in form');
    expect(text).toContain('defaultRoles');
  });

  it('ADR-024 checks the cost analysis after day one for the Environment Management Hour meter', async () => {
    const text = section(await read(), 'Cost check after day one');

    expect(text).toContain('Environment Management Hour');
    expect(text).toContain('Cost analysis');
  });

  it('RNF-017 documents the one-time measurement on the hosted URL', async () => {
    const text = section(await read(), 'RNF-017 measurement');

    expect(text).toContain('node scripts/measure-rnf017.mjs');
    expect(text).toContain('two runs');
    expect(text).toMatch(/Owner step|RNF-017 (pass|FAIL)/u);
  });
});

describe('docs/runbooks/deploy.md: owner steps before the first run and recovery', () => {
  it('ADR-024 lists the owner steps before the first provisioning, with the environment branch rule and the lock', async () => {
    const text = section(await read(), 'Owner steps before the first run');
    const steps = text.split('\n').filter((line) => /^\d+\. /u.test(line));

    expect(steps.length).toBeGreaterThanOrEqual(7);
    for (const fact of [
      'az provider register',
      'public',
      'deployment branch policy',
      'done on 2026-10-24',
      'only the branch `main`',
      'az lock create',
      'ROSETTA_DEPLOY_ENABLED',
    ]) {
      expect(text).toContain(fact);
    }
    expect(text).not.toContain('tag ruleset');
  });

  it('DEC-104 deploys come from main only: a tag-triggered deploy is refused by the environment, so Release runs by hand on main', async () => {
    const text = await read();
    const release = section(text, 'Release and image');

    expect(section(text, 'Owner steps before the first run')).toContain(
      'refused by the environment',
    );
    expect(release).toContain('refused by the `production` environment');
    expect(release).toContain('workflow_dispatch');
    expect(section(text, 'Deploy')).toContain('Run workflow, branch `main`');
  });
});

describe('docs/runbooks/deploy.md: registry, restore and backup', () => {
  it('ADR-024 sets no registry for the public GHCR image', async () => {
    const text = await read();

    expect(text).toContain('no registry');
    expect(text).not.toContain('az containerapp registry set');
  });

  it('RF-1306 restores into a new server through the db-server input, and keeps the passwords', async () => {
    const text = section(await read(), 'Restore');

    expect(text).toContain('az postgres flexible-server restore');
    expect(text).toContain('db-server');
    expect(text).toContain('rotate-passwords');
  });

  it('RF-1306 a backup from the owner machine lifts the lock to remove its firewall rule and puts it back', async () => {
    const text = section(await read(), 'Backup');

    expect(text).toContain('az lock delete');
    expect(text).toContain('firewall-rule delete');
    expect(text.indexOf('az lock delete')).toBeLessThan(text.lastIndexOf('az lock create'));
  });
});
