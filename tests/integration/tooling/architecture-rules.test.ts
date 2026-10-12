import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';

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
  const args = [
    depcruise,
    'src',
    '--config',
    config,
    '--output-type',
    'err',
    '--output-to',
    report,
  ];
  await run('node', args, { cwd: root }).catch(() => undefined);
  return readFile(report, 'utf8');
}

const importing = (module: string): string =>
  `import * as m from '${module}';\nexport const x = m;\n`;

describe('dependency-cruiser layer rule: domain', () => {
  const root = useTempRoot('rosetta-arch-');

  it('RNF-013 domain importing infrastructure is reported', async () => {
    const report = await cruise(root.path, {
      'src/infrastructure/a.ts': 'export const a = 1;\n',
      'src/domain/b.ts': "import { a } from '../infrastructure/a.js';\nexport const b = a;\n",
    });

    expect(report).toContain('domain-imports-only-domain');
  });

  it('RNF-013 domain importing any Node built-in is reported', async () => {
    const report = await cruise(root.path, { 'src/domain/path.ts': importing('node:path') });

    expect(report).toContain('domain-no-node-builtins');
  });
});

describe('dependency-cruiser layer rule: node I/O', () => {
  const root = useTempRoot('rosetta-arch-');

  it.each([
    ['src/application/use.ts', 'node:fs/promises'],
    ['src/application/use.ts', 'node:crypto'],
    ['src/application/use.ts', 'fs'],
    ['src/presentation/web/route.ts', 'node:fs'],
  ])('RNF-013 %s importing %s is reported outside infrastructure', async (file, module) => {
    const report = await cruise(root.path, { [file]: importing(module) });

    expect(report).toContain('node-io-only-in-infrastructure');
  });

  it('RNF-013 infrastructure may import node:fs and node:crypto', async () => {
    const report = await cruise(root.path, {
      'src/infrastructure/io.ts':
        "import * as fs from 'node:fs/promises';\nimport * as c from 'node:crypto';\nexport const x = [fs, c];\n",
    });

    expect(report).not.toContain('node-io-only-in-infrastructure');
  });
});

describe('dependency-cruiser layer rule: fastify', () => {
  const root = useTempRoot('rosetta-arch-');

  it.each([
    ['src/application/server.ts', 'fastify'],
    ['src/infrastructure/server.ts', '@fastify/cookie'],
    ['src/presentation/main.ts', 'fastify'],
  ])('RNF-013 %s importing %s is reported outside presentation/web', async (file, module) => {
    const report = await cruise(root.path, { [file]: importing(module) });

    expect(report).toContain('fastify-only-in-presentation-web');
  });

  it('RNF-013 presentation/web may import fastify', async () => {
    const report = await cruise(root.path, {
      'src/presentation/web/server.ts': importing('fastify'),
    });

    expect(report).not.toContain('fastify-only-in-presentation-web');
  });
});

describe('dependency-cruiser layer rule: provider SDKs', () => {
  const root = useTempRoot('rosetta-arch-');

  it.each([
    ['src/infrastructure/guards/egress.ts', 'openai'],
    ['src/infrastructure/github/api.ts', 'openai/resources/chat/completions'],
    ['src/infrastructure/providers/ollama/client.ts', 'openai'],
    ['src/infrastructure/providers/shared.ts', 'openai'],
  ])('RF-402 %s importing %s is reported outside the openai adapter', async (file, module) => {
    const report = await cruise(root.path, { [file]: importing(module) });

    expect(report).toContain('openai-sdk-only-in-openai-adapter');
  });

  it('RF-402 the adapter under infrastructure/providers/openai may import openai', async () => {
    const report = await cruise(root.path, {
      'src/infrastructure/providers/openai/client.ts': importing('openai'),
    });

    expect(report).not.toContain('openai-sdk-only-in-openai-adapter');
  });
});

describe('dependency-cruiser layer rule: tree-sitter', () => {
  const root = useTempRoot('rosetta-arch-');

  it.each([
    ['src/infrastructure/scan/universal/walk.ts', 'web-tree-sitter'],
    ['src/infrastructure/files/reader.ts', 'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm'],
    ['src/application/ports/thing.ts', 'web-tree-sitter'],
  ])('RF-110 %s importing %s is reported', async (file, module) => {
    const report = await cruise(root.path, { [file]: importing(module) });

    expect(report).toContain('tree-sitter-only-in-packs');
  });

  it('RF-110 a pack under infrastructure/scan/packs may import web-tree-sitter', async () => {
    const report = await cruise(root.path, {
      'src/infrastructure/scan/packs/csharp/grammar.ts': importing('web-tree-sitter'),
    });

    expect(report).not.toContain('tree-sitter-only-in-packs');
  });
});

describe('dependency-cruiser layer rule: provider adapters', () => {
  const root = useTempRoot('rosetta-arch-');
  const adapters = {
    'src/infrastructure/providers/ollama/ollama-provider.ts': 'export class OllamaProvider {}\n',
    'src/infrastructure/providers/openai/openai-provider.ts': 'export class OpenAiProvider {}\n',
    'src/infrastructure/providers/fake/fake-provider.ts': 'export class FakeProvider {}\n',
  };

  it.each([
    [
      'src/presentation/composition-root.ts',
      '../infrastructure/providers/ollama/ollama-provider.js',
    ],
    ['src/infrastructure/guards/other.ts', '../providers/openai/openai-provider.js'],
    ['src/application/use.ts', '../infrastructure/providers/fake/fake-provider.js'],
    ['src/infrastructure/providers/provider-factory.ts', './openai/openai-provider.js'],
  ])('ADR-003 %s importing %s is reported', async (file, module) => {
    const report = await cruise(root.path, { ...adapters, [file]: importing(module) });

    expect(report).toContain('adapters-only-via-adapter-builder');
  });

  it('ADR-003 only the adapter builder may import the Ollama and OpenAI adapters', async () => {
    const report = await cruise(root.path, {
      ...adapters,
      'src/infrastructure/providers/adapter-builder.ts':
        "import { OllamaProvider } from './ollama/ollama-provider.js';\nimport { OpenAiProvider } from './openai/openai-provider.js';\nexport const built = [OllamaProvider, OpenAiProvider];\n",
    });

    expect(report).not.toContain('adapters-only-via-adapter-builder');
  });
});
