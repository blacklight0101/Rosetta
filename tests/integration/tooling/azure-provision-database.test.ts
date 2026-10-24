import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeAz, type FakeAz } from '../../support/fake-az.js';
import {
  at,
  runStep,
  stepScript,
  stepTexts,
  workflowDocument,
} from '../../support/workflow-yaml.js';

// ADR-024, RF-1306, RNF-003, RNF-016, DEC-140, P1-184: the PostgreSQL part of
// .github/workflows/azure-provision.yml: the server, its lock, the database passwords and roles.
// Single steps run against a fake az (tests/support/fake-az.ts); nothing reaches Azure. The
// argument shapes are those of azure-cli 2.87 and later (the ubuntu-latest runner has 2.91), where
// `create` commands use --server-name for the server and --name for the child resource.

const provision = (): Promise<unknown> => workflowDocument('azure-provision.yml');
const text = async (): Promise<string> => stepTexts(await provision(), 'provision').join('\n');

let az: FakeAz | undefined;
afterEach(async () => {
  await az?.dispose();
  az = undefined;
});

const base = {
  AZ_RG: 'rg-rosetta',
  AZ_LOCATION: 'spaincentral',
  AZ_APP: 'ca-rosetta',
  AZ_MIGRATE_JOB: 'caj-rosetta-migrate',
  AZ_DB_SERVER: 'psql-rosetta-test',
  AZ_DB_NAME: 'rosetta',
  AZ_DB_ADMIN: 'rosettaadmin',
};

/** Runs one provisioning step against a fake az; SECRETS_DIR is the fake's own folder. */
async function step(
  name: string,
  missing: boolean,
  extra: Readonly<Record<string, string>> = {},
): Promise<{ code: number; output: string; calls: string[]; folder: string }> {
  az = await fakeAz({ missing });
  const env = { ...az.env, ...base, SECRETS_DIR: az.folder, ...extra };
  const result = await runStep(stepScript(await provision(), 'provision', name), env, az.prelude);
  return { ...result, calls: await az.calls(), folder: az.folder };
}

const secretFile = (folder: string, file: string): Promise<string> =>
  readFile(join(folder, file), 'utf8');

describe('azure-provision.yml PostgreSQL server (azure-cli 2.87+)', () => {
  it('RF-1306 makes the PostgreSQL 17 B1MS server with 32 GiB, TLS required, Azure services only, 7 days of backups', async () => {
    const workflow = await text();

    for (const flag of [
      '--version 17',
      '--tier Burstable',
      '--sku-name Standard_B1ms',
      '--storage-size 32',
      '--backup-retention 7',
      '--public-access None',
    ]) {
      expect(workflow).toContain(flag);
    }
    expect(workflow).toContain('--name require_secure_transport --value on');
    expect(workflow).toContain('--start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0');
  });

  it('ADR-024 on the first run creates the server, the firewall rule and the database with the 2.87+ argument shapes', async () => {
    const { code, calls } = await step('PostgreSQL Flexible Server', true);
    const call = (prefix: string): string =>
      calls.find((line) => line.startsWith(prefix)) ?? `missing: ${prefix}`;

    expect(code).toBe(0);
    expect(call('postgres flexible-server create')).not.toContain('--database-name');
    expect(call('postgres flexible-server firewall-rule create')).toContain(
      '--resource-group rg-rosetta --server-name psql-rosetta-test --name AllowAllAzureServicesAndResourcesWithinAzureIps',
    );
    expect(call('postgres flexible-server db show')).toContain(
      '--resource-group rg-rosetta --server-name psql-rosetta-test --name rosetta',
    );
    expect(call('postgres flexible-server db create')).toContain(
      '--resource-group rg-rosetta --server-name psql-rosetta-test --name rosetta',
    );
    expect(call('postgres flexible-server parameter set')).toContain(
      '--server-name psql-rosetta-test --name require_secure_transport',
    );
  });

  it('ADR-024 no command uses --database-name, which 2.87+ keeps for elastic clusters only', async () => {
    expect(await text()).not.toContain('--database-name');
  });
});

describe('azure-provision.yml PostgreSQL public access (azure-cli 2.91)', () => {
  it('ADR-024 turns public access on before the firewall rule, also on a server made without it', async () => {
    // azure-cli 2.91 creates the server with public access disabled for --public-access None, and
    // refuses a firewall rule on such a server; the update converges a server that already exists.
    for (const missing of [true, false]) {
      const { code, calls } = await step('PostgreSQL Flexible Server', missing);
      const update = calls.findIndex(
        (line) =>
          line.startsWith('postgres flexible-server update') &&
          line.includes(
            '--resource-group rg-rosetta --name psql-rosetta-test --public-access Enabled',
          ),
      );
      const rule = calls.findIndex((line) =>
        line.startsWith('postgres flexible-server firewall-rule create'),
      );

      expect(code).toBe(0);
      expect(update).toBeGreaterThanOrEqual(0);
      expect(update).toBeLessThan(rule);
    }
  });
});

describe('azure-provision.yml administrator password (RNF-003)', () => {
  it('RNF-003 the administrator password is new, masked, and reaches az only as an @file', async () => {
    const created = await step('PostgreSQL Flexible Server', true);
    const admin = await secretFile(created.folder, 'db-admin-password');

    expect(admin).toMatch(/^[0-9a-f]{48}$/u);
    expect(call(created.calls, 'flexible-server create')).toContain(
      `--admin-password @${created.folder}/db-admin-password`,
    );
    expect(created.output).toContain(`::add-mask::${admin}`);
    expect(created.calls.join('\n')).not.toContain(admin);

    const updated = await step('PostgreSQL Flexible Server', false);
    expect(call(updated.calls, 'flexible-server update')).toContain(
      `--admin-password @${updated.folder}/db-admin-password`,
    );
  });
});

function call(calls: string[], needle: string): string {
  return calls.find((line) => line.includes(needle)) ?? `missing: ${needle}`;
}

describe('azure-provision.yml secret values never on a command line (RNF-003)', () => {
  it('RNF-003 every secret-valued az argument is an @file of the mode-700 folder', async () => {
    const workflow = await text();
    const flags = /--(?:admin-password|logs-workspace-key|azure-file-account-key|secrets) (\S+)/gu;
    const values = [...workflow.matchAll(flags)].map((match) => match[1] ?? '');

    expect(values.length).toBeGreaterThanOrEqual(6);
    expect(values.filter((value) => !value.startsWith('\\"@$SECRETS_DIR/'))).toEqual([]);
  });

  it('RNF-003 the generated values are written without a trailing newline and never with cat', async () => {
    const workflow = await text();

    expect(workflow).toContain('openssl rand -hex 24 | tr -dc 0-9a-f > \\"$SECRETS_DIR/');
    expect(workflow).not.toMatch(/\bcat\b/u);
  });
});

describe('azure-provision.yml database passwords (RNF-016, DEC-140)', () => {
  const hex = /^[0-9a-f]{48}$/u;

  it('RNF-016 the workflow has a rotate-passwords input that defaults to false', async () => {
    const input = at(await provision(), 'on', 'workflow_dispatch', 'inputs', 'rotate-passwords');

    expect(at(input, 'type')).toBe('boolean');
    expect(at(input, 'default')).toBe(false);
    expect(at(await provision(), 'jobs', 'provision', 'env', 'ROTATE_PASSWORDS')).toBe(
      '${{ inputs.rotate-passwords }}',
    );
  });

  it('DEC-140 the first provisioning makes new passwords for both roles', async () => {
    const { code, calls, folder } = await step('Database passwords', true, {
      ROTATE_PASSWORDS: 'false',
    });

    expect(code).toBe(0);
    expect(await secretFile(folder, 'app-db-password')).toMatch(hex);
    expect(await secretFile(folder, 'migrator-db-password')).toMatch(hex);
    expect(calls.join('\n')).not.toContain('secret show');
  });

  it('RNF-016 a rerun keeps the stored passwords, so the running app keeps its connections', async () => {
    const { code, output, calls, folder } = await step('Database passwords', false, {
      ROTATE_PASSWORDS: 'false',
    });

    expect(code).toBe(0);
    expect(await secretFile(folder, 'app-db-password')).toBe('app-old');
    expect(await secretFile(folder, 'migrator-db-password')).toBe('migrator-old');
    expect(call(calls, 'containerapp secret show')).toContain('--secret-name database-url');
    expect(call(calls, 'containerapp job secret show')).toContain(
      '--secret-name database-migrator-url',
    );
    const leaks = output.split('\n').filter((line) => line.includes('-old'));
    expect(leaks.every((line) => line.startsWith('::add-mask::'))).toBe(true);
  });

  it('RNF-016 rotate-passwords makes new passwords on a rerun', async () => {
    const { code, folder } = await step('Database passwords', false, { ROTATE_PASSWORDS: 'true' });

    expect(code).toBe(0);
    expect(await secretFile(folder, 'app-db-password')).toMatch(hex);
    expect(await secretFile(folder, 'migrator-db-password')).toMatch(hex);
  });
});

describe('azure-provision.yml roles and lock (DEC-140, ADR-024)', () => {
  it('DEC-140 creates the two roles of data-model.md section 6 from the job, idempotently, passwords from the environment', async () => {
    const script = stepScript(await provision(), 'provision', 'Database roles');

    expect(script).toContain(
      "WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_migrator')",
    );
    expect(script).toContain(
      "WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app')",
    );
    expect(script).toContain("ALTER ROLE rosetta_app LOGIN PASSWORD :'app_password';");
    expect(script).toContain('ALTER DATABASE rosetta OWNER TO rosetta_migrator;');
    expect(script).toContain('GRANT USAGE ON SCHEMA public TO rosetta_app;');
    expect(script).toContain('\\getenv app_password ROSETTA_APP_DB_PASSWORD');
    expect(script).toContain('sslmode=require');
    expect(script).not.toMatch(/-v \w+_password=/u);
  });

  it('ADR-024 puts a CanNotDelete lock on the server, and warns with the owner command when it cannot', async () => {
    const script = stepScript(await provision(), 'provision', 'CanNotDelete lock');

    expect(script).toContain('az lock create');
    expect(script).toContain('--lock-type CanNotDelete');
    expect(script).toContain('Microsoft.DBforPostgreSQL/flexibleServers');
    expect(script).toContain('::warning::');
  });

  it('RNF-003 removes the generated values even when a step failed', async () => {
    const steps = at(await provision(), 'jobs', 'provision', 'steps');
    const cleanup: unknown = (Array.isArray(steps) ? steps : []).find(
      (each: unknown) => at(each, 'name') === 'Remove the generated values',
    );

    expect(at(cleanup, 'if')).toBe('always()');
    expect(at(cleanup, 'run')).toContain('rm -rf');
  });
});
