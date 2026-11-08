import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import {
  at,
  keysOf,
  runStep,
  stepIndex,
  stepScript,
  stepTexts,
  workflowDocument,
} from '../../support/workflow-yaml.js';

// RF-1304, DEC-207, DEC-227, ADR-025, ADR-028 (Proposed), P8-63, P8-64, P8-141:
// .github/workflows/release-checks.yml. When the CI run of a push to main (the owner's release merge)
// completes, GitHub starts the checks (workflow_run), which build, scan and push the image of that
// commit before the 06:00 release, with the steps of the image job of release.yml and the workflow
// token only. A workflow_run runs from the default branch (develop), so the job names the commit of
// the CI run itself (COMMIT). The ZAP and staging confirmation and the release/ready status are
// tested in release-checks-ready.test.ts, the hourly sweep in release-checks-sweep.test.ts.

const checks = (): Promise<unknown> => workflowDocument('release-checks.yml');
const release = (): Promise<unknown> => workflowDocument('release.yml');
const image = 'ghcr.io/blacklight0101/rosetta';
const root = useTempRoot('rosetta-release-checks-');
const headSha = '${{ github.event.workflow_run.head_sha }}';

/** The steps of one job, as parsed. */
function stepsOf(document: unknown, job: string): unknown[] {
  const found = at(document, 'jobs', job, 'steps');
  return Array.isArray(found) ? found : [];
}

/**
 * A step of the image job as text, without what names its commit (the checkout ref and the tag
 * inputs) and without the checkout depth: each job fetches the history it reads (DEC-227), and only
 * the checks job reads the parents of the merge (workflow-fetch-depth.test.ts pins both depths).
 */
function withoutCommit(step: unknown): string {
  return JSON.stringify(step, (key, value: unknown) =>
    ['ref', 'REF_TYPE', 'REF_NAME', 'fetch-depth'].includes(key) ? undefined : value,
  );
}

/** The step of the checks job whose text contains `needle`, as parsed. */
async function step(needle: string): Promise<unknown> {
  const document = await checks();
  const steps = at(document, 'jobs', 'checks', 'steps');
  return Array.isArray(steps) ? steps[stepIndex(document, 'checks', needle)] : undefined;
}

/**
 * Every expression of a parsed workflow: the inside of each `${{ }}` in any value, and each `if:`
 * value written without `${{ }}`. Comments are not part of the parsed document.
 */
function expressions(node: unknown, key = ''): string[] {
  if (Array.isArray(node)) return node.flatMap((each: unknown) => expressions(each));
  if (typeof node === 'object' && node !== null) {
    return keysOf(node).flatMap((name) => expressions(at(node, name), name));
  }
  if (typeof node !== 'string') return [];
  const wrapped = [...node.matchAll(/\$\{\{\s*(.*?)\s*\}\}/gsu)].map((match) => match[1] ?? '');
  return key === 'if' && wrapped.length === 0 ? [node.trim()] : wrapped;
}

describe('release-checks.yml trigger', () => {
  it('DEC-227 starts when the CI run of a push to main completes, and hourly for the sweep, on nothing else', async () => {
    const document = await checks();

    expect(keysOf(at(document, 'on'))).toEqual(['workflow_run', 'schedule']);
    expect(at(document, 'on', 'workflow_run')).toEqual({
      workflows: ['CI'],
      types: ['completed'],
      branches: ['main'],
    });
    expect(at(document, 'on', 'schedule')).toEqual([{ cron: '41 * * * *' }]);
  });

  it('DEC-227 the checks job runs only for a CI run of a push to main of this repository, never for a fork', async () => {
    const condition = String(at(await checks(), 'jobs', 'checks', 'if'));

    expect(condition.split(' && ')).toEqual([
      "github.event_name == 'workflow_run'",
      "github.event.workflow_run.event == 'push'",
      "github.event.workflow_run.head_branch == 'main'",
      'github.event.workflow_run.head_repository.full_name == github.repository',
    ]);
  });

  it('RF-1304 the checks of one commit queue behind each other and are never cancelled half-way; other commits do not replace them', async () => {
    expect(at(await checks(), 'concurrency')).toEqual({
      group: 'release-checks-${{ github.event.workflow_run.head_sha || github.ref }}',
      'cancel-in-progress': false,
    });
  });

  it('DEC-227 every step works on the commit of the CI run, not on the default branch the workflow runs from', async () => {
    const document = await checks();
    const job = JSON.stringify(at(document, 'jobs', 'checks'));

    expect(at(document, 'jobs', 'checks', 'env')).toEqual({ COMMIT: headSha });
    expect(at(await step('actions/checkout@'), 'with', 'ref')).toBe(headSha);
    expect(at(await step('bash scripts/release-tags.sh'), 'env')).toEqual({
      IMAGE: 'ghcr.io/blacklight0101/rosetta',
      REF_TYPE: 'branch',
      REF_NAME: '${{ github.event.workflow_run.head_branch }}',
    });
    expect(job).not.toContain('GITHUB_SHA');
    expect(job).not.toContain('github.sha');
  });
});

describe('release-checks.yml permissions and token', () => {
  it('RF-1304 the default token is read-only; the checks job holds contents and checks read and packages, statuses and issues write', async () => {
    const document = await checks();

    expect(keysOf(document)).toEqual(['name', 'on', 'permissions', 'concurrency', 'jobs']);
    expect(at(document, 'permissions')).toEqual({ contents: 'read' });
    expect(keysOf(at(document, 'jobs'))).toEqual(['checks', 'sweep']);
    // No continue-on-error, defaults or strategy: the job's result is the real one.
    expect(keysOf(at(document, 'jobs', 'checks'))).toEqual([
      'name',
      'if',
      'runs-on',
      'timeout-minutes',
      'permissions',
      'env',
      'steps',
    ]);
    expect(at(document, 'jobs', 'checks', 'timeout-minutes')).toBe(30);
    expect(at(document, 'jobs', 'checks', 'permissions')).toEqual({
      contents: 'read',
      checks: 'read',
      packages: 'write',
      statuses: 'write',
      issues: 'write',
    });
  });
});

describe('release-checks.yml secrets, variables and tokens', () => {
  it('RNF-003 reads no secret, no token but the workflow token and no variable but ROSETTA_STAGING_ENABLED, in any expression', async () => {
    const document = await checks();
    const all = expressions(document);

    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((expression) => /\bsecrets\b/iu.test(expression))).toEqual([]);
    expect(new Set(all.filter((expression) => /\bvars\b/iu.test(expression)))).toEqual(
      new Set(['vars.ROSETTA_STAGING_ENABLED']),
    );
    expect(new Set(all.filter((expression) => /token/iu.test(expression)))).toEqual(
      new Set(['github.token']),
    );
    expect(JSON.stringify(document)).not.toContain('id-token');
  });

  it('RNF-003 the expression scan sees secrets and variables however they are written', () => {
    const written = {
      jobs: {
        a: {
          if: "vars['X'] == 'true'",
          env: {
            A: "${{ secrets['X'] }}",
            B: '${{ toJSON(secrets) }}',
            C: '${{ toJSON(vars) }}',
            D: '${{ SECRETS.X }}',
            E: '${{ Vars.Y }}',
            F: '${{\n  secrets.Z\n}}',
          },
        },
      },
    };
    const found = expressions(written).filter((each) => /\b(?:secrets|vars)\b/iu.test(each));

    expect(found).toEqual([
      "vars['X'] == 'true'",
      "secrets['X']",
      'toJSON(secrets)',
      'toJSON(vars)',
      'SECRETS.X',
      'Vars.Y',
      'secrets.Z',
    ]);
  });

  it('RNF-003 the checkout keeps no credentials on the runner', async () => {
    expect(at(await step('actions/checkout@'), 'with', 'persist-credentials')).toBe(false);
  });
});

describe('release-checks.yml image build and tags', () => {
  it('RF-1304 has every step of the image job of release.yml, unchanged but for the commit it names, and in the same order', async () => {
    const own = stepsOf(await checks(), 'checks').map(withoutCommit);
    const released = stepsOf(await release(), 'image').map(withoutCommit);
    let from = 0;
    const missing = released.filter((text) => {
      const found = own.indexOf(text, from);
      from = found < 0 ? from : found + 1;
      return found < 0;
    });

    expect(released.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});

describe('release-checks.yml image tags', () => {
  it('RF-1300 a push to main pushes only the sha-<short> tag of its commit from release-tags.sh, never latest', async () => {
    const document = await checks();
    const output = join(root.path, 'github-output.txt');
    const pushed = join(root.path, 'docker.log');
    await writeFile(output, '');
    // Under workflow_run GITHUB_SHA is the head of develop; the tag names COMMIT, the merge.
    const tagged = await runStep(stepScript(document, 'checks', 'Work out the image tags'), {
      IMAGE: String(at(await step('bash scripts/release-tags.sh'), 'env', 'IMAGE')),
      REF_TYPE: 'branch',
      REF_NAME: 'main',
      COMMIT: '0123456789abcdef0123456789abcdef01234567',
      GITHUB_SHA: 'fedcba9876543210fedcba9876543210fedcba98',
      GITHUB_OUTPUT: output,
    });
    const tags = /^tags=(.*)$/mu.exec(await readFile(output, 'utf8'))?.[1] ?? '';
    const docker = `docker() { printf '%s\\n' "$*" >> "$DOCKER_LOG"; }`;
    const push = await runStep(
      stepScript(document, 'checks', 'Push the tags'),
      { TAGS: tags, DOCKER_LOG: pushed },
      docker,
    );
    const calls = (await readFile(pushed, 'utf8')).split('\n').filter((line) => line !== '');

    expect([tagged.code, push.code]).toEqual([0, 0]);
    expect(calls.filter((line) => line.startsWith('push '))).toEqual([`push ${image}:sha-0123456`]);
    expect(calls.filter((line) => line.startsWith('tag '))).toEqual([
      `tag rosetta:release ${image}:sha-0123456`,
    ]);
    // The pushed tags come only from the script's output, and no other step tags or pushes.
    expect(at(await step('docker push'), 'env')).toEqual({
      TAGS: '${{ steps.tags.outputs.tags }}',
    });
    expect(
      stepTexts(document, 'checks').filter((text) => /docker (?:push|tag)\b/u.test(text)),
    ).toHaveLength(1);
  });
});

describe('release-checks.yml scan gate and GHCR login', () => {
  it('RF-1304 the Trivy gate fails the job on a fixable High or Critical finding before anything is pushed', async () => {
    const document = await checks();
    const build = stepIndex(document, 'checks', 'docker build');
    const scan = stepIndex(document, 'checks', 'aquasecurity/trivy-action@');
    const login = stepIndex(document, 'checks', 'docker login');
    const push = stepIndex(document, 'checks', 'docker push');
    const gate = await step('aquasecurity/trivy-action@');

    expect(build).toBeGreaterThan(-1);
    expect(scan).toBeGreaterThan(build);
    expect(login).toBeGreaterThan(scan);
    expect(push).toBeGreaterThan(login);
    expect(at(gate, 'with')).toEqual({
      'image-ref': 'rosetta:release',
      format: 'table',
      severity: 'HIGH,CRITICAL',
      'ignore-unfixed': true,
      'vuln-type': 'os,library',
      'exit-code': '1',
    });
    expect(at(gate, 'continue-on-error')).toBeUndefined();
    expect(at(gate, 'if')).toBeUndefined();
  });

  it('RNF-003 logs in to GHCR with the workflow token on standard input and always logs out after the push', async () => {
    const document = await checks();
    const login = await step('docker login');
    const logout = await step('docker logout');

    expect(at(login, 'run')).toContain('--password-stdin');
    expect(at(login, 'env', 'TOKEN')).toBe('${{ github.token }}');
    expect(at(logout, 'if')).toBe('always()');
    expect(at(logout, 'run')).toBe('docker logout ghcr.io');
    expect(stepIndex(document, 'checks', 'docker logout')).toBeGreaterThan(
      stepIndex(document, 'checks', 'docker push'),
    );
  });
});
