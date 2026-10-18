import { describe, expect, it } from 'vitest';
import { at, keysOf, stepIndex, stepTexts, workflowDocument } from '../../support/workflow-yaml.js';

// RF-1300, RF-1304, DEC-57, DEC-104, P1-55: .github/workflows/release.yml. It builds the image once,
// scans it and pushes it to GHCR as `sha-<short>` (and `X.Y.Z` for a tag), attaches a CycloneDX
// SBOM to the GitHub release of a tag, and holds a deploy job that stays off until the owner opens
// gate G-07 (the repository variable ROSETTA_DEPLOY_ENABLED and the `production` environment).

const release = (): Promise<unknown> => workflowDocument('release.yml');
const image = 'ghcr.io/blacklight0101/rosetta';

describe('release.yml triggers', () => {
  it('DEC-104 runs only on a pushed v* tag and by hand, never on a pull request or a push to main', async () => {
    const document = await release();

    expect(keysOf(at(document, 'on')).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(keysOf(at(document, 'on', 'push'))).toEqual(['tags']);
    expect(at(document, 'on', 'push', 'tags')).toEqual(['v*']);
  });

  it('RNF-003 the default token is read-only; only the image job may write packages and only the SBOM job contents', async () => {
    const document = await release();
    const jobs = keysOf(at(document, 'jobs'));
    const writes = (scope: string): string[] =>
      jobs.filter((job) => at(document, 'jobs', job, 'permissions', scope) === 'write');

    expect(at(document, 'permissions')).toEqual({ contents: 'read' });
    expect(writes('packages')).toEqual(['image']);
    expect(writes('contents')).toEqual(['sbom']);
  });
});

describe('release.yml image job', () => {
  it('DEC-104 builds only from main or a v* tag', async () => {
    const condition = String(at(await release(), 'jobs', 'image', 'if'));

    expect(condition).toContain("github.ref == 'refs/heads/main'");
    expect(condition).toContain("startsWith(github.ref, 'refs/tags/v')");
  });

  it('RF-1300 tags the image sha-<short> and X.Y.Z of the tag, never latest', async () => {
    const steps = stepTexts(await release(), 'image').join('\n');

    expect(steps).toContain(image);
    expect(steps).toContain('sha-');
    expect(steps).toContain('${REF_NAME#v}');
    expect(steps).not.toContain(':latest');
  });

  it('DEC-29 refuses a tag that is not vX.Y.Z of package.json or not on main', async () => {
    const steps = stepTexts(await release(), 'image').join('\n');

    expect(steps).toContain('package.json');
    expect(steps).toContain('git merge-base --is-ancestor');
  });

  it('RF-1300 scans the image with Trivy before it pushes anything', async () => {
    const document = await release();
    const build = stepIndex(document, 'image', 'docker build');
    const scan = stepIndex(document, 'image', 'aquasecurity/trivy-action@');
    const push = stepIndex(document, 'image', 'docker push');

    expect(build).toBeGreaterThan(-1);
    expect(scan).toBeGreaterThan(build);
    expect(push).toBeGreaterThan(scan);
  });

  it('RNF-003 logs in to GHCR with the job token through the environment, on standard input', async () => {
    const steps = stepTexts(await release(), 'image').join('\n');

    expect(steps).toContain('--password-stdin');
    expect(steps).toContain('${{ github.token }}');
  });
});

describe('release.yml SBOM job', () => {
  it('DEC-57 runs only for a tag and attaches a CycloneDX SBOM to its GitHub release', async () => {
    const document = await release();
    const steps = stepTexts(document, 'sbom').join('\n');

    expect(String(at(document, 'jobs', 'sbom', 'if'))).toContain(
      "startsWith(github.ref, 'refs/tags/v')",
    );
    expect(steps).toContain('npm sbom --sbom-format cyclonedx');
    expect(steps).toContain('gh release upload');
  });
});

describe('release.yml deploy job (pending G-07)', () => {
  it('DEC-104 is skipped unless the owner set ROSETTA_DEPLOY_ENABLED and runs in the production environment', async () => {
    const deploy = at(await release(), 'jobs', 'deploy');

    expect(String(at(deploy, 'if'))).toContain("vars.ROSETTA_DEPLOY_ENABLED == 'true'");
    const environment = at(deploy, 'environment');
    expect(typeof environment === 'string' ? environment : at(environment, 'name')).toBe(
      'production',
    );
    expect(at(deploy, 'needs')).toEqual(expect.arrayContaining(['image']));
  });

  it('DEC-104 deploys only main or a v* tag, one deploy at a time, never cancelled half-way', async () => {
    const deploy = at(await release(), 'jobs', 'deploy');

    expect(String(at(deploy, 'if'))).toContain("github.ref == 'refs/heads/main'");
    expect(at(deploy, 'concurrency', 'cancel-in-progress')).toBe(false);
  });

  it('threat model 5 refuses to deploy a commit whose ZAP baseline did not pass', async () => {
    const document = await release();

    expect(stepIndex(document, 'deploy', 'zap-baseline')).toBeGreaterThan(-1);
    expect(at(document, 'jobs', 'deploy', 'permissions', 'checks')).toBe('read');
  });

  it('RF-1304 checks the owner stored every named secret, then runs the smoke script on the public URL', async () => {
    const document = await release();
    const steps = stepTexts(document, 'deploy');
    const secrets = stepIndex(document, 'deploy', 'secrets.RAILWAY_TOKEN');
    const smoke = stepIndex(document, 'deploy', 'node scripts/smoke.mjs');

    expect(secrets).toBeGreaterThan(-1);
    expect(smoke).toBeGreaterThan(secrets);
    expect(steps.join('\n')).toContain('secrets.ROSETTA_SMOKE_PASSWORD');
    expect(steps.join('\n')).toContain('vars.ROSETTA_PUBLIC_URL');
  });

  it('RF-1304 the host steps are marked pending G-07 and fail instead of pretending to deploy', async () => {
    const steps = stepTexts(await release(), 'deploy').join('\n');

    expect(steps).toContain('Pending G-07');
    expect(steps).toContain('exit 1');
  });
});
