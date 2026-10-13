import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ciJob } from '../../support/workflow-files.js';

// The CI caches of environments-and-delivery.md section 6: Prettier's results and Playwright's
// browsers. ESLint runs without a cache on purpose: its cache keys a file on its own content, and the
// type-aware rules also read the files it imports, so a cached "clean" can hide a new error.

const scripts = z.object({ scripts: z.record(z.string(), z.string()) });
const packageScripts = async (): Promise<Record<string, string>> =>
  scripts.parse(JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'))).scripts;

describe('GitHub Actions workflows: caches', () => {
  it('RNF-001 format:check keeps a content cache that the Linux verify job restores', async () => {
    const { 'format:check': format } = await packageScripts();
    const verify = await ciJob('verify');

    expect(format).toBe('prettier --check --cache --cache-strategy content .');
    expect(verify).toContain('path: node_modules/.cache/prettier');
    expect(verify).toMatch(
      /key: prettier-\$\{\{ runner\.os \}\}-\$\{\{ hashFiles\('package-lock\.json'/u,
    );
    expect(verify).toContain('restore-keys: |');
  });

  it('RNF-001 lint runs without a cache, because type-aware rules read other files', async () => {
    const { lint } = await packageScripts();

    expect(lint).toBe('eslint . --max-warnings 0');
  });

  it.each(['verify', 'e2e-shard', 'compose-smoke'])(
    'RNF-005 job %s caches the browsers per Playwright version and installs only the system packages on a hit',
    async (id) => {
      const job = await ciJob(id);

      expect(job).toContain("require('@playwright/test/package.json').version");
      expect(job).toContain('path: ~/.cache/ms-playwright');
      expect(job).toContain(
        'key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}',
      );
      expect(job).toMatch(
        /if: [^\n]*steps\.playwright-cache\.outputs\.cache-hit != 'true'\n\s+run: npx playwright install --with-deps chromium\n/u,
      );
      expect(job).toMatch(
        /if: [^\n]*steps\.playwright-cache\.outputs\.cache-hit == 'true'\n\s+run: npx playwright install-deps chromium\n/u,
      );
    },
  );
});
