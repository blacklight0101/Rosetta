import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPublishedIndex } from '../../../src/infrastructure/report/index-check.js';
import { auditHtml } from '../../support/html-audit.js';
import { secretCases } from '../../support/secret-fixture.js';
import { secretFindings } from '../../support/secret-scan.js';

// RF-800, RF-501, RF-507, RNF-003: the committed `site/` folder that GitHub Pages publishes from `main`
// (its links, its drift from the build, its content), and the smoke script run against a loopback
// server and from a bare copy with no node_modules. The workflow's own properties are in
// pages-workflow.test.ts.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const siteFolder = `${root}site/`;
const runKey = '20261012-100000-understand';
const sampleLabel = "Sample run (recorded test data); the owner's demo run replaces it (DEC-105)";
const execFileAsync = promisify(execFile);
const staleFixture = join(root, 'tests/fixtures/pages/index-without-run.html');

let server: Server;
let baseUrl: string;
let served = '';

beforeAll(async () => {
  server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(served);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('The loopback server has no address.');
  }
  baseUrl = `http://127.0.0.1:${String(address.port)}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
});

/** Every file under a folder, as paths relative to it, in order. */
async function filesOf(folder: string): Promise<string[]> {
  const names = (await readdir(folder, { recursive: true })).sort();
  const files: string[] = [];
  for (const name of names) {
    // readdir gives backslashes on Windows; the links of the site are POSIX paths.
    const path = name.split(sep).join(posix.sep);
    if ((await stat(join(folder, name))).isFile()) files.push(path);
  }
  return files;
}

/** The targets of the links and resources of a page or a Markdown document. */
function linksOf(text: string, markdown: boolean): string[] {
  const pattern = markdown ? /\]\(([^)\s]+)\)/gu : /\b(?:href|src)="([^"]*)"/gu;
  return [...text.matchAll(pattern)].map((match) => match[1] ?? '');
}

interface SmokeOutcome {
  readonly code: number;
  readonly stderr: string;
}

function outcomeOf(error: unknown): SmokeOutcome {
  const code =
    error instanceof Error && 'code' in error && typeof error.code === 'number' ? error.code : -1;
  const stderr =
    error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
      ? error.stderr
      : '';
  return { code, stderr };
}

async function smoke(url: string, cwd: string = root): Promise<SmokeOutcome> {
  return await execFileAsync(
    process.execPath,
    [
      '--import',
      './scripts/register-ts.mjs',
      'scripts/pages-smoke.mjs',
      url,
      runKey,
      '--attempts',
      '1',
    ],
    { cwd },
  ).then(
    (result) => ({ code: 0, stderr: result.stderr }),
    (error: unknown) => outcomeOf(error),
  );
}

describe('the committed site/ folder', () => {
  it('RF-800 holds the index, the report, the replay, the run documents, their assets and .nojekyll, and nothing else', async () => {
    expect(await filesOf(siteFolder)).toEqual(
      [
        '.nojekyll',
        'cards/BR/BR-001.md',
        'cost.html',
        'cost.md',
        'index.html',
        'questions.html',
        'replay.html',
        'replay.js',
        'report.css',
        'report.html',
        'report.md',
        'spec.md',
      ].sort(),
    );
  });

  it('RF-800 its index shows the run key the Pages smoke step looks for and labels the sample', async () => {
    const index = await readFile(`${siteFolder}index.html`, 'utf8');

    expect(checkPublishedIndex(index, runKey)).toEqual({ ok: true });
    expect(index).toContain(sampleLabel);
  });

  it('RF-800 every relative link and resource of the site points at a file of the site', async () => {
    const files = await filesOf(siteFolder);
    const broken: string[] = [];
    for (const name of files.filter((file) => /\.(?:html|md)$/u.test(file))) {
      const text = await readFile(join(siteFolder, name), 'utf8');
      for (const target of linksOf(text, name.endsWith('.md'))) {
        if (target === '' || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/iu.test(target)) {
          continue;
        }
        const path = target.split('#')[0] ?? '';
        const resolved = posix.normalize(posix.join(posix.dirname(name), path));
        if (!files.includes(resolved)) broken.push(`${name} -> ${target}`);
      }
    }

    expect(broken).toEqual([]);
  });
});

describe('the committed site/ content', () => {
  it('RF-507 the sample carries no script text, no javascript: link and no link to another host than GitHub', async () => {
    const found: string[] = [];
    for (const name of await filesOf(siteFolder)) {
      if (!/\.(?:html|md|js)$/u.test(name)) continue;
      const text = await readFile(join(siteFolder, name), 'utf8');
      if (/javascript:|onerror|__pwned/iu.test(text)) found.push(`${name}: active text`);
      for (const tag of text.match(/<script[^>]*>/giu) ?? []) {
        if (tag !== '<script src="replay.js" defer>') found.push(`${name}: ${tag}`);
      }
      for (const address of text.match(/https?:\/\/[^"\s)]+/gu) ?? []) {
        if (!address.startsWith('https://github.com/')) found.push(`${name}: ${address}`);
      }
    }

    expect(found).toEqual([]);
  });

  it('RF-507 runs no script from the repository text: only the replay script loads', async () => {
    const pages = await Promise.all(
      ['index.html', 'report.html', 'replay.html', 'questions.html', 'cost.html'].map(
        async (name) => auditHtml(await readFile(`${siteFolder}${name}`, 'utf8')),
      ),
    );

    expect(pages.map((page) => page.scripts)).toEqual([[], [], ['replay.js'], [], []]);
    expect(pages.flatMap((page) => page.foreignLinks)).toEqual([]);
  });
});

describe('the committed site/ secret scan', () => {
  it('RNF-003 no file of the site holds a secret by the patterns of the masker', async () => {
    expect((await filesOf(siteFolder)).length).toBeGreaterThan(5);

    expect(await secretFindings(siteFolder)).toEqual([]);
  });

  it('RNF-003 the scan finds every kind of fake secret planted in any file of a copy of the site', async () => {
    const copy = await mkdtemp(join(tmpdir(), 'rosetta-site-secrets-'));
    try {
      const extensions = ['html', 'md', 'js', 'css', 'txt', 'nojekyll', ''];
      const planted = secretCases.map((found, index) => {
        const extension = extensions[index % extensions.length] ?? '';
        return `nested/${String(index).padStart(3, '0')}${extension === '' ? '' : '.'}${extension}`;
      });
      await mkdir(join(copy, 'nested'), { recursive: true });
      await Promise.all(
        secretCases.map((found, index) =>
          writeFile(
            join(copy, planted[index] ?? ''),
            `<p>${found.text}</p>
`,
            'utf8',
          ),
        ),
      );

      const findings = await secretFindings(copy);

      expect(secretCases.length).toBeGreaterThan(10);
      expect(findings.map((finding) => finding.split(': ')[0]).sort()).toEqual([...planted].sort());
    } finally {
      await rm(copy, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});

describe('the committed site/ drift', () => {
  it('RF-800 a fresh build into a folder of its own matches the committed site/ byte for byte', async () => {
    const out = await mkdtemp(join(tmpdir(), 'rosetta-site-'));
    try {
      await execFileAsync(
        process.execPath,
        ['--import', './scripts/register-ts.mjs', 'scripts/build-sample-site.mjs', out],
        { cwd: root },
      );
      const built = await filesOf(out);
      expect(built).toEqual(await filesOf(siteFolder));
      for (const name of built) {
        expect(await readFile(join(out, name))).toEqual(await readFile(join(siteFolder, name)));
      }
    } finally {
      await rm(out, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});

describe('scripts/pages-smoke.mjs', () => {
  it('RF-800 fails when the published index does not show the run id (fixture of a stale page)', async () => {
    served = await readFile(staleFixture, 'utf8');
    const outcome = await smoke(baseUrl);

    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain(runKey);
  });

  it('RF-800 passes when the published index shows the run id', async () => {
    served = await readFile(`${siteFolder}index.html`, 'utf8');

    expect((await smoke(baseUrl)).code).toBe(0);
  });

  it('RF-800 runs from a copy of its own files with no node_modules (the smoke job runs no npm ci)', async () => {
    const copy = await mkdtemp(join(tmpdir(), 'rosetta-smoke-'));
    try {
      const needed = [
        'package.json',
        'scripts/pages-smoke.mjs',
        'scripts/register-ts.mjs',
        'scripts/ts-resolve-hook.mjs',
        'src/infrastructure/report/index-check.ts',
        'src/infrastructure/report/html-text.ts',
      ];
      for (const file of needed) {
        await mkdir(dirname(join(copy, file)), { recursive: true });
        await copyFile(join(root, file), join(copy, file));
      }
      served = await readFile(`${siteFolder}index.html`, 'utf8');

      expect((await smoke(baseUrl, copy)).code).toBe(0);
    } finally {
      await rm(copy, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});
