import { describe, expect, it } from 'vitest';
import { ci, ciJob } from '../../support/workflow-files.js';

// P8-55 (RNF-001, ADR-025): the caches of the CI run (docs/runbooks/ci-throughput.md section 6). The
// Playwright browsers were cached by P1-183 (workflows.test.ts). The image job keeps its layers in the
// GitHub Actions cache. The web bundle is not cached: building it takes under a second, less than a
// cache restore.

/** The text of one step of a job, from its `- ` line to the next step. */
function stepOf(job: string, marker: string): string {
  const at = job.indexOf(marker);
  if (at < 0) return '';
  const from = job.lastIndexOf('\n      - ', at);
  const next = job.indexOf('\n      - ', at);
  return job.slice(from, next < 0 ? undefined : next);
}

const BUILDX = /uses: docker\/setup-buildx-action@[0-9a-f]{40} # v\d+\.\d+\.\d+/u;
const BUILD = 'uses: docker/build-push-action@';

describe('GitHub Actions workflows: image layer cache', () => {
  it('RNF-001 the image job builds through BuildKit, whose own image is pinned by digest', async () => {
    const job = await ciJob('image');
    const builder = stepOf(job, 'uses: docker/setup-buildx-action@');

    expect(job).toMatch(BUILDX);
    expect(job).toMatch(/uses: docker\/build-push-action@[0-9a-f]{40} # v\d+\.\d+\.\d+/u);
    // The builder starts a container; like every image CI starts, it is pinned (RNF-003).
    expect(builder).toMatch(/driver-opts: image=moby\/buildkit:v[\d.]+@sha256:[0-9a-f]{64}\n/u);
    expect(job.indexOf('uses: docker/setup-buildx-action@')).toBeLessThan(job.indexOf(BUILD));
  });

  it('RNF-001 only the image job uses the layer cache; compose smoke and ZAP build with docker compose', async () => {
    const text = await ci();

    expect(text.match(/type=gha/gu) ?? []).toHaveLength(2);
    expect(await ciJob('compose-smoke')).toContain('up -d --build --wait');
    expect(await ciJob('zap-baseline')).toContain('up -d --build --wait');
  });
});

describe('GitHub Actions workflows: image layer cache, the builds', () => {
  it('RNF-001 the runtime image reads the layer cache, writes it only on a push, and is loaded for the test and Trivy', async () => {
    const job = await ciJob('image');
    const runtime = stepOf(job, '- name: Build the runtime image');

    expect(runtime).toContain(BUILD);
    expect(runtime).toContain('context: .\n');
    expect(runtime).toContain('tags: ${{ env.ROSETTA_IMAGE }}\n');
    expect(runtime).toContain('load: true\n');
    expect(runtime).toContain('cache-from: type=gha,scope=rosetta-image\n');
    // A pull request reads the cache of its base branch but never writes one: the 10 GB of the
    // repository stay for the npm and Playwright caches, and a pull request cannot seed develop's.
    expect(runtime).toContain(
      "cache-to: ${{ github.event_name == 'push' && 'type=gha,mode=max,scope=rosetta-image' || '' }}\n",
    );
    expect(runtime).toContain("if: needs.changes.outputs.code != 'false'");
  });

  it('RNF-001 a cached layer cannot be stale: the runtime stage, which upgrades the system packages, is always rebuilt', async () => {
    const runtime = stepOf(await ciJob('image'), '- name: Build the runtime image');

    // Every other layer is keyed by BuildKit on its instruction and the content of the files it
    // copies (package-lock.json for npm ci, src and web for the build), and the base by its digest.
    expect(runtime).toContain('no-cache-filters: runtime\n');
  });

  it('RNF-001 the test image still builds, from the same builder', async () => {
    const job = await ciJob('image');
    const test = stepOf(job, '- name: Build the test image');

    expect(test).toContain(BUILD);
    expect(test).toContain('context: .\n');
    expect(test).toContain('target: test\n');
    expect(job.indexOf('- name: Build the runtime image')).toBeLessThan(
      job.indexOf('- name: Build the test image'),
    );
    expect(job).not.toMatch(/run: docker build\b/u);
  });
});

describe('GitHub Actions workflows: web bundle', () => {
  it('RNF-005 each e2e shard builds the web bundle itself; no cache can serve an old one', async () => {
    const text = await ci();

    expect(text).not.toContain('dist/web');
    expect(await ciJob('e2e-shard')).toContain('run: node scripts/run-e2e.mjs "--shard=$SHARD/3"');
  });
});
