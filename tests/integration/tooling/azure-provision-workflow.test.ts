import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  at,
  keysOf,
  runStep,
  stepIndex,
  stepScript,
  stepTexts,
  workflowDocument,
} from '../../support/workflow-yaml.js';

// RF-1304, RF-1306, RNF-003, RNF-016, ADR-024, DEC-140, P1-184: .github/workflows/azure-provision.yml.
// Run only by hand in the `production` environment, it logs in to Azure over OIDC and creates,
// idempotently, the hosted deployment of ADR-024 in rg-rosetta. Running it creates billed
// resources, so the tests read it and run single steps against a fake az only.

const provision = (): Promise<unknown> => workflowDocument('azure-provision.yml');
const text = async (): Promise<string> => stepTexts(await provision(), 'provision').join('\n');
const read = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), 'utf8').catch(() => '');

/** The text of one `## ` section of a Markdown file, up to the next one. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}`);
  if (start < 0) return '';
  const next = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, next < 0 ? undefined : next);
}

/**
 * The hosted secrets of environments-and-delivery.md section 4: every backticked name of a table
 * row whose Secret cell is "yes" and that is not for local use or tests only.
 */
async function hostedSecrets(): Promise<string[]> {
  const table = section(await read('docs/environments-and-delivery.md'), '4. Configuration');
  return table.split('\n').flatMap((row) => {
    const cells = row.split('|').map((cell) => cell.trim());
    const [name = '', required = '', secret = ''] = cells.slice(1);
    if (secret !== 'yes' || /local only|tests only/u.test(required)) return [];
    return [...name.matchAll(/`([A-Z0-9_]+)`/gu)].map((match) => match[1] ?? '');
  });
}

describe('azure-provision.yml trigger and job', () => {
  it('ADR-024 runs only by hand, from main, in the production environment, never cancelled half-way', async () => {
    const document = await provision();

    expect(keysOf(at(document, 'on'))).toEqual(['workflow_dispatch']);
    expect(at(document, 'on', 'workflow_dispatch', 'inputs', 'image-tag', 'required')).toBe(true);
    expect(keysOf(at(document, 'jobs'))).toEqual(['provision']);
    expect(at(document, 'jobs', 'provision', 'if')).toBe("github.ref == 'refs/heads/main'");
    expect(at(document, 'jobs', 'provision', 'environment', 'name')).toBe('production');
    expect(at(document, 'jobs', 'provision', 'concurrency', 'group')).toBe('deploy-production');
    expect(at(document, 'jobs', 'provision', 'concurrency', 'cancel-in-progress')).toBe(false);
  });

  it('RNF-003 the default token is read-only and only the provision job may request an OIDC token', async () => {
    const document = await provision();

    expect(at(document, 'permissions')).toEqual({ contents: 'read' });
    expect(at(document, 'jobs', 'provision', 'permissions')).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
  });

  it('ADR-024 logs in with azure/login over OIDC, with the production variables and no creds', async () => {
    const steps = at(await provision(), 'jobs', 'provision', 'steps');
    const login: unknown = (Array.isArray(steps) ? steps : []).find((step: unknown) =>
      String(at(step, 'uses')).startsWith('azure/login@'),
    );

    expect(at(login, 'with')).toEqual({
      'client-id': '${{ vars.AZURE_CLIENT_ID }}',
      'tenant-id': '${{ vars.AZURE_TENANT_ID }}',
      'subscription-id': '${{ vars.AZURE_SUBSCRIPTION_ID }}',
    });
  });

  it('ADR-024 works in the existing resource group rg-rosetta in Spain Central', async () => {
    const env = at(await provision(), 'jobs', 'provision', 'env');

    expect(at(env, 'AZ_RG')).toBe('rg-rosetta');
    expect(at(env, 'AZ_LOCATION')).toBe('spaincentral');
    expect(await text()).not.toContain('az group create');
  });
});

const settings = async (): Promise<string> =>
  stepScript(await provision(), 'provision', 'The provisioning settings are stored');
const complete = {
  IMAGE_TAG: 'sha-0123abc',
  AZURE_CLIENT_ID: 'value-client',
  AZURE_TENANT_ID: 'value-tenant',
  AZURE_SUBSCRIPTION_ID: 'value-subscription',
  ROSETTA_SECRET_KEY: 'value-key',
  ROSETTA_ADMIN_USER: 'value-admin',
  ROSETTA_ADMIN_PASSWORD: 'value-password',
};

describe('azure-provision.yml owner secrets', () => {
  it('RNF-003 checks the settings before anything else', async () => {
    const document = await provision();

    expect(stepIndex(document, 'provision', 'The provisioning settings are stored')).toBe(0);
  });

  it.each(['ROSETTA_SECRET_KEY', 'ROSETTA_ADMIN_USER', 'ROSETTA_ADMIN_PASSWORD'])(
    'RNF-003 a missing %s stops the job with its name and no value',
    async (name) => {
      const env = Object.fromEntries(Object.entries(complete).filter(([key]) => key !== name));
      const result = await runStep(await settings(), env);

      expect(result.code).not.toBe(0);
      expect(result.output).toContain(name);
      expect(result.output).not.toContain('value-');
    },
  );

  it('RNF-003 passes with every required setting, and refuses an image tag that is not sha-<short>', async () => {
    expect((await runStep(await settings(), complete)).code).toBe(0);
    expect((await runStep(await settings(), { ...complete, IMAGE_TAG: 'latest' })).code).not.toBe(
      0,
    );
  });
});

describe('azure-provision.yml secret placement', () => {
  it('RNF-003 every hosted secret of section 4 is a secretref: of the workflow or set by the owner', async () => {
    const workflow = await text();
    const owner = section(
      await read('docs/runbooks/deploy.md'),
      'Environment secrets the owner adds',
    );
    const names = await hostedSecrets();

    expect(names).toEqual(expect.arrayContaining(['DATABASE_URL', 'ROSETTA_SECRET_KEY']));
    const unplaced = names.filter(
      (name) => !workflow.includes(`${name}=secretref:`) && !owner.includes(`\`${name}\``),
    );
    expect(unplaced).toEqual([]);
  });

  it('RNF-003 the owner secrets come from the production environment, never from a literal', async () => {
    const workflow = await text();

    for (const name of [
      'ROSETTA_SECRET_KEY',
      'ROSETTA_SECRET_KEY_PREVIOUS',
      'ROSETTA_ADMIN_USER',
      'ROSETTA_ADMIN_PASSWORD',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'ROSETTA_GITHUB_TOKEN',
    ]) {
      expect(workflow).toContain(`"${name}":"\${{ secrets.${name} }}"`);
    }
  });
});
