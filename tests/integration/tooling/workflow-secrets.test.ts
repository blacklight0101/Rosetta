import { describe, expect, it } from 'vitest';
import {
  jobs,
  load,
  runLines,
  triggerAndSecretProblems,
  violations,
  type Workflow,
} from '../../support/workflow-files.js';

// RNF-003, DEC-104, ADR-024, P1-55, P1-184: where the workflows may read secrets, how they log in
// to Azure, and that no step prints a secret. Workflows are checked as text.

describe('GitHub Actions workflows: secrets', () => {
  // The exceptions are the deploy job of release.yml (P1-55, DEC-104) and the provision job of
  // azure-provision.yml (P1-184): they read the secrets of the `production` environment.
  it('RNF-003 uses no pull_request_target trigger and no secrets outside the two production jobs', async () => {
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
      '      OK: ${{ secrets.X }}',
      ...tail,
    ];

    expect(triggerAndSecretProblems({ name: 'release.yml', lines })).toEqual(['secrets context']);
  });

  it('RNF-003 the secrets rule allows secrets inside the deploy job of release.yml only', () => {
    const lines = ['name: Release', 'jobs:', '  deploy:', '    env:', '      A: ${{ secrets.X }}'];

    expect(triggerAndSecretProblems({ name: 'release.yml', lines })).toEqual([]);
    expect(triggerAndSecretProblems({ name: 'ci.yml', lines })).toEqual(['secrets context']);
    expect(triggerAndSecretProblems({ name: 'azure-provision.yml', lines })).toEqual([
      'secrets context',
    ]);
  });

  it('P1-184 the secrets rule allows secrets inside the provision job of azure-provision.yml only', () => {
    const lines = ['name: Azure', 'jobs:', '  provision:', '    env:', '      A: ${{ secrets.X }}'];

    expect(triggerAndSecretProblems({ name: 'azure-provision.yml', lines })).toEqual([]);
    expect(triggerAndSecretProblems({ name: 'release.yml', lines })).toEqual(['secrets context']);
  });
});

const login = /^\s*(?:- )?uses: azure\/login@/u;
const oidcInputs = [
  'client-id: ${{ vars.AZURE_CLIENT_ID }}',
  'tenant-id: ${{ vars.AZURE_TENANT_ID }}',
  'subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}',
];

/** The ids of the jobs of one workflow that log in to Azure. */
const loginJobs = (lines: string[]): string[] =>
  jobs(lines)
    .filter((job) => job.body.some((line) => login.test(line)))
    .map((job) => job.id);

/** A `creds:` input, or an Azure login without the three `vars.` inputs of OIDC. */
function loginProblems({ lines }: Workflow): string[] {
  const logins = lines.flatMap((line, i) => (login.test(line) ? [i] : []));
  return [
    ...(/^\s*creds:/mu.test(lines.join('\n')) ? ['creds:'] : []),
    ...logins.flatMap((i) => {
      const block = lines.slice(i + 1, i + 5).join('\n');
      return oidcInputs
        .filter((input) => !block.includes(input))
        .map((input) => `line ${String(i + 1)} without ${input}`);
    }),
  ];
}

/**
 * An OIDC token outside a job that logs in to Azure (in production) or deploys GitHub Pages
 * (actions/deploy-pages needs one), or an Azure login without a token or outside production.
 */
function tokenProblems({ lines }: Workflow): string[] {
  const azure = loginJobs(lines);
  const top = lines.slice(0, lines.indexOf('jobs:')).join('\n');
  const perJob = jobs(lines).flatMap(({ id, body }) => {
    const writes = body.some((line) => /^ {6}id-token: write$/u.test(line));
    const production = body.some((line) => /^ {6}name: production$/u.test(line));
    const pages = body.some((line) => line.includes('uses: actions/deploy-pages@'));
    if (azure.includes(id)) return writes && production ? [] : [`${id}: Azure login settings`];
    return writes && !pages ? [`${id}: id-token`] : [];
  });
  return [...(top.includes('id-token') ? ['top-level id-token'] : []), ...perJob];
}

describe('GitHub Actions workflows: Azure login (P1-184, ADR-024)', () => {
  it('RNF-003 every Azure login uses OIDC with the three production variables and no creds', async () => {
    expect(await violations(loginProblems)).toEqual([]);
    expect((await load()).flatMap((workflow) => loginJobs(workflow.lines)).sort()).toEqual([
      'deploy',
      'provision',
    ]);
  });

  it('RNF-003 id-token: write only on the jobs that log in to Azure, each in production, and the Pages deploy', async () => {
    expect(await violations(tokenProblems)).toEqual([]);
  });

  it('RNF-003 the token rule catches a job that asks for a token it does not use', () => {
    const lines = ['jobs:', '  build:', '    permissions:', '      id-token: write'];

    expect(tokenProblems({ name: 'x.yml', lines })).toEqual(['build: id-token']);
  });
});

// A line that echoes or prints a secret-looking variable is allowed only to mask it, or to pipe it
// to a --password-stdin login.
const sensitive = /\$\{?\w*(?:password|secret|token|_key|database_url|migrator_url)\w*/iu;
const printed = (lines: string[]): string[] =>
  runLines(lines)
    .filter((line) => /\b(?:echo|printf)\b/u.test(line) && sensitive.test(line))
    .filter((line) => !line.includes('::add-mask::') && !line.includes('--password-stdin'))
    .map((line) => line.trim());

describe('GitHub Actions workflows: no secret on the log (P1-184)', () => {
  it('RNF-003 no run: step echoes a secrets. value or a generated password', async () => {
    expect(await violations(({ lines }) => printed(lines))).toEqual([]);
  });

  it('RNF-003 the check itself catches an echo of a password and lets a mask through', () => {
    const lines = [
      '    steps:',
      '      - run: |',
      '          echo "$ROSETTA_ADMIN_PASSWORD"',
      '          echo "::add-mask::$admin_password"',
    ];

    expect(printed(lines)).toEqual(['echo "$ROSETTA_ADMIN_PASSWORD"']);
  });

  it('DEC-171 no workflow names the dropped host', async () => {
    const dropped = new RegExp(['rail', 'way'].join(''), 'iu');

    expect(await violations(({ lines }) => lines.filter((line) => dropped.test(line)))).toEqual([]);
  });
});
