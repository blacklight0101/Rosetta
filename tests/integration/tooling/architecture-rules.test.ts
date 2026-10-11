import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const repo = process.cwd();
const depcruise = join(repo, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs');
const config = join(repo, '.dependency-cruiser.cjs');

async function cruise(root: string, files: Record<string, string>): Promise<string> {
  for (const [path, source] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), source);
  }
  await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"module":"nodenext"}}');
  const report = join(root, 'report.txt');
  await run(
    'node',
    [depcruise, 'src', '--config', config, '--output-type', 'err', '--output-to', report],
    {
      cwd: root,
    },
  ).catch(() => undefined);
  return readFile(report, 'utf8');
}

describe('dependency-cruiser layer rules', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rosetta-arch-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('RNF-013 domain importing infrastructure is reported', async () => {
    const report = await cruise(root, {
      'src/infrastructure/a.ts': 'export const a = 1;\n',
      'src/domain/b.ts': "import { a } from '../infrastructure/a.js';\nexport const b = a;\n",
    });

    expect(report).toContain('domain-imports-only-domain');
  });

  it.each([
    ['src/application/use.ts', 'node:fs/promises'],
    ['src/application/use.ts', 'node:crypto'],
    ['src/application/use.ts', 'fs'],
    ['src/presentation/web/route.ts', 'node:fs'],
  ])(
    'RNF-013 %s importing %s is reported as a built-in outside infrastructure',
    async (file, module) => {
      const report = await cruise(root, {
        [file]: `import * as m from '${module}';\nexport const x = m;\n`,
      });

      expect(report).toContain('node-io-only-in-infrastructure');
    },
  );

  it('RNF-013 infrastructure may import node:fs and node:crypto', async () => {
    const report = await cruise(root, {
      'src/infrastructure/io.ts':
        "import * as fs from 'node:fs/promises';\nimport * as c from 'node:crypto';\nexport const x = [fs, c];\n",
    });

    expect(report).not.toContain('node-io-only-in-infrastructure');
  });

  it('RNF-013 domain importing any Node built-in is reported', async () => {
    const report = await cruise(root, {
      'src/domain/path.ts': "import * as p from 'node:path';\nexport const x = p;\n",
    });

    expect(report).toContain('domain-no-node-builtins');
  });

  it.each([
    ['src/application/server.ts', 'fastify'],
    ['src/infrastructure/server.ts', '@fastify/cookie'],
    ['src/presentation/main.ts', 'fastify'],
  ])('RNF-013 %s importing %s is reported outside presentation/web', async (file, module) => {
    const report = await cruise(root, {
      [file]: `import * as m from '${module}';\nexport const x = m;\n`,
    });

    expect(report).toContain('fastify-only-in-presentation-web');
  });

  it('RNF-013 presentation/web may import fastify', async () => {
    const report = await cruise(root, {
      'src/presentation/web/server.ts': "import * as m from 'fastify';\nexport const x = m;\n",
    });

    expect(report).not.toContain('fastify-only-in-presentation-web');
  });
});
