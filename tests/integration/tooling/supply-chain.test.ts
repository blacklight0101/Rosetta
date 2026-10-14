import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { imagesIn, isDigestPinned, workflowImages } from '../../support/ci-images.js';

// RNF-003, DEC-125, P1-49 F-17 and F-18: the supply-chain controls that live in configuration files,
// read as data: the images CI starts are pinned by digest, and Dependabot watches the Dockerfile
// with the same two-week cooldown as the other ecosystems.

const DIGEST = `sha256:${'a'.repeat(64)}`;

describe('CI service images are pinned by digest', () => {
  it('RNF-003 the three PostgreSQL service images of ci.yml carry a sha256 digest', async () => {
    const images = await workflowImages('ci.yml');

    expect(images.filter((image) => image.startsWith('postgres'))).toHaveLength(3);
    expect(images.filter((image) => !isDigestPinned(image))).toEqual([]);
  });

  it('RNF-003 every workflow image is pinned, and the pinned PostgreSQL is the one compose.yaml pins', async () => {
    const names = (await readdir(join(process.cwd(), '.github', 'workflows'))).filter((name) =>
      name.endsWith('.yml'),
    );
    const compose = await readFile(join(process.cwd(), 'compose.yaml'), 'utf8');
    const composeImage = /image:\s*(postgres:\S+)/u.exec(compose)?.[1];

    const all = (await Promise.all(names.map(workflowImages))).flat();

    expect(all.filter((image) => !isDigestPinned(image))).toEqual([]);
    expect(new Set(all.filter((image) => image.startsWith('postgres')))).toEqual(
      new Set([composeImage]),
    );
  });
});

describe('the digest check', () => {
  it.each([
    ['a tag only', 'postgres:17'],
    ['latest', 'postgres:latest'],
    ['no tag and no digest', 'postgres'],
    ['a short digest', `postgres:17@sha256:${'a'.repeat(63)}`],
    ['a long digest', `postgres:17@sha256:${'a'.repeat(65)}`],
    ['a digest in upper case', `postgres:17@sha256:${'A'.repeat(64)}`],
    ['another algorithm', `postgres:17@sha512:${'a'.repeat(64)}`],
    ['a digest followed by text', `postgres:17@${DIGEST} extra`],
    ['an empty string', ''],
  ])('RNF-003 rejects an image reference with %s', (_label, image) => {
    expect(isDigestPinned(image)).toBe(false);
  });

  it.each([
    ['a tag and a digest', `postgres:17@${DIGEST}`],
    ['a digest only', `postgres@${DIGEST}`],
    ['a registry path', `ghcr.io/owner/image:1.2@${DIGEST}`],
  ])('RNF-003 accepts an image reference with %s', (_label, image) => {
    expect(isDigestPinned(image)).toBe(true);
  });
});

describe('the image finder', () => {
  it('RNF-003 finds services in a job, in a matrix entry, a container and a docker:// step', () => {
    const document: unknown = parse(`
jobs:
  plain:
    services:
      db:
        image: postgres:17
  matrixed:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            services:
              cache:
                image: redis:7
  boxed:
    container: node:24
    steps:
      - uses: docker://alpine:3
  boxed-long:
    container:
      image: debian:12
`);

    expect(imagesIn(document).sort()).toEqual([
      'alpine:3',
      'debian:12',
      'node:24',
      'postgres:17',
      'redis:7',
    ]);
  });
});

const updates = z.object({
  updates: z.array(
    z.object({
      'package-ecosystem': z.string(),
      directory: z.string(),
      cooldown: z.object({ 'default-days': z.number() }).optional(),
      schedule: z.object({ interval: z.string() }),
    }),
  ),
});

async function dependabotUpdates(): Promise<z.output<typeof updates>['updates']> {
  const text = await readFile(join(process.cwd(), '.github', 'dependabot.yml'), 'utf8');
  return updates.parse(parse(text)).updates;
}

describe('Dependabot covers the Dockerfile', () => {
  it('DEC-125 F-17 has a docker entry for the folder of the Dockerfile with a cooldown of 14 days', async () => {
    const docker = (await dependabotUpdates()).filter(
      (entry) => entry['package-ecosystem'] === 'docker',
    );

    expect(docker).toHaveLength(1);
    expect(docker[0]?.directory).toBe('/');
    expect(docker[0]?.cooldown?.['default-days']).toBeGreaterThanOrEqual(14);
    expect((await stat(join(process.cwd(), 'Dockerfile'))).isFile()).toBe(true);
  });

  it('DEC-125 every Dependabot entry waits at least 14 days and watches a folder that exists', async () => {
    const entries = await dependabotUpdates();

    expect(entries.map((entry) => entry['package-ecosystem']).sort()).toEqual([
      'docker',
      'github-actions',
      'npm',
    ]);
    for (const entry of entries) {
      expect(entry.cooldown?.['default-days'] ?? 0).toBeGreaterThanOrEqual(14);
      expect((await stat(join(process.cwd(), entry.directory))).isDirectory()).toBe(true);
    }
  });
});
