import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeAz, type FakeAz } from '../../support/fake-az.js';
import { runStep, stepScript, workflowDocument } from '../../support/workflow-yaml.js';

// DEC-175, ADR-025: the staging target of .github/workflows/azure-provision.yml on the shared
// PostgreSQL server. Staging reads the role passwords back from the production app and migrate job
// and fails when they are missing; it never creates a role or sets a password; the database name
// reaches psql as a variable; the staging app gets no server provider keys and scales to zero.

const provision = (): Promise<unknown> => workflowDocument('azure-provision.yml');

let az: FakeAz | undefined;
afterEach(async () => {
  await az?.dispose();
  az = undefined;
});

const staging = {
  TARGET: 'staging',
  ROTATE_PASSWORDS: 'false',
  AZ_RG: 'rg-rosetta',
  AZ_APP: 'ca-rosetta-staging',
  AZ_MIGRATE_JOB: 'caj-rosetta-stg-migrate',
  AZ_PRODUCTION_APP: 'ca-rosetta',
  AZ_PRODUCTION_MIGRATE_JOB: 'caj-rosetta-migrate',
};

/** Runs the passwords step for staging against a fake az. */
async function passwords(options: { missing?: boolean; noSecrets?: boolean }): Promise<{
  code: number;
  output: string;
  calls: string[];
  folder: string;
}> {
  az = await fakeAz(options);
  const env = { ...az.env, ...staging, SECRETS_DIR: az.folder };
  const script = stepScript(await provision(), 'provision', 'Database passwords');
  const result = await runStep(script, env, az.prelude);
  return { ...result, calls: await az.calls(), folder: az.folder };
}

describe('azure-provision.yml staging database passwords', () => {
  it('DEC-175 reads the passwords of the production app and migrate job, even before the staging app exists', async () => {
    const { code, calls, folder } = await passwords({ missing: true });
    const secretCalls = calls.filter((call) => call.includes('secret show'));

    expect(code).toBe(0);
    expect(await readFile(join(folder, 'app-db-password'), 'utf8')).toBe('app-old');
    expect(await readFile(join(folder, 'migrator-db-password'), 'utf8')).toBe('migrator-old');
    expect(secretCalls).toHaveLength(2);
    expect(secretCalls[0]).toContain('containerapp secret show --name ca-rosetta ');
    expect(secretCalls[1]).toContain('containerapp job secret show --name caj-rosetta-migrate ');
  });

  it('DEC-175 fails, and makes no password, when production holds no database URLs', async () => {
    const { code, output, folder } = await passwords({ noSecrets: true });

    expect(code).not.toBe(0);
    expect(output).toContain('::error::');
    await expect(readFile(join(folder, 'app-db-password'), 'utf8')).rejects.toThrow();
  });

  it('DEC-175 never runs openssl for a staging password', async () => {
    const script = stepScript(await provision(), 'provision', 'Database passwords');
    const stagingBranch = script.slice(script.indexOf('staging'), script.indexOf('elif'));

    expect(stagingBranch).toContain('AZ_PRODUCTION_APP');
    expect(stagingBranch).not.toContain('openssl');
  });
});

describe('azure-provision.yml roles on the shared server', () => {
  it('DEC-175 passes the database name as a psql variable and never hard-codes rosetta', async () => {
    const script = stepScript(await provision(), 'provision', 'Database roles');

    expect(script).toContain('-v db_name="$AZ_DB_NAME"');
    expect(script).toContain('ALTER DATABASE :"db_name" OWNER TO rosetta_migrator;');
    expect(script).not.toContain('ALTER DATABASE rosetta ');
  });

  it('DEC-175 creates roles and sets their passwords only when the target manages them (production)', async () => {
    const script = stepScript(await provision(), 'provision', 'Database roles');
    const guarded = script.slice(script.indexOf('\\if :manage_roles'), script.indexOf('\\endif'));

    expect(script).toMatch(/\[ "\$TARGET" != staging \]/u);
    expect(script).toContain('-v manage_roles="$manage_roles"');
    expect(guarded).toContain('CREATE ROLE rosetta_migrator');
    expect(guarded).toContain('CREATE ROLE rosetta_app');
    expect(guarded).toContain("ALTER ROLE rosetta_migrator LOGIN PASSWORD :'migrator_password';");
    expect(guarded).toContain("ALTER ROLE rosetta_app LOGIN PASSWORD :'app_password';");
  });
});

describe('azure-provision.yml staging app', () => {
  it('DEC-175 gives the staging app no server provider keys', async () => {
    const script = stepScript(await provision(), 'provision', 'Create or update the Container App');

    expect(script).toMatch(
      /if \[ "\$TARGET" = staging \]; then\n(?:\s*#[^\n]*\n)*\s*unset OPENAI_API_KEY ANTHROPIC_API_KEY\n\s*fi/u,
    );
  });

  it('DEC-175 takes the minimum replicas from the target (staging scales to zero), at most one', async () => {
    const script = stepScript(await provision(), 'provision', 'Create or update the Container App');

    expect(script).toContain('--argjson min_replicas "$AZ_MIN_REPLICAS"');
    expect(script).toContain('scale: {minReplicas: $min_replicas, maxReplicas: 1}');
  });

  it('DEC-175 the summary names the target', async () => {
    const script = stepScript(await provision(), 'provision', 'Summary');

    expect(script).toContain('### Azure provision ($TARGET)');
  });
});
