import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-003, ADR-006, ADR-007, P1-29: the provider factory is the only way to get a provider. An
// adapter is constructed only in the adapter builder, and the three decorators that guard a call
// are constructed only where the factory wraps an adapter, so no code path can hold an adapter
// that is not BudgetGuard(EgressGuard(ObservedProvider(adapter))). The live-check scripts outside
// src/ are the opted-in evaluations of ADR-008 and build adapters on purpose.

const sourceRoot = join(process.cwd(), 'src');

async function sourceFiles(): Promise<{ path: string; text: string }[]> {
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'));
  return Promise.all(
    files.map(async (entry) => {
      const file = join(entry.parentPath, entry.name);
      return {
        path: relative(sourceRoot, file).split(sep).join('/'),
        text: await readFile(file, 'utf8'),
      };
    }),
  );
}

async function filesConstructing(classes: readonly string[]): Promise<string[]> {
  const pattern = new RegExp(String.raw`new\s+(?:${classes.join('|')})\s*\(`, 'u');
  return (await sourceFiles()).filter((file) => pattern.test(file.text)).map((file) => file.path);
}

/** The files whose text names the adapter builder module or its entry point, in any import form. */
function namingTheBuilder(files: readonly { path: string; text: string }[]): string[] {
  const pattern = /adapter-builder|\brealAdapters\b/u;
  return files.filter((file) => pattern.test(file.text)).map((file) => file.path);
}

describe('provider factory boundary', () => {
  it.each([
    ["import { realAdapters } from '../infrastructure/providers/adapter-builder.js';"],
    ["import { realAdapters as raw } from './adapter-builder.js';"],
    ["export const load = () => import('../providers/adapter-builder.js');"],
    ["export { realAdapters } from './adapter-builder.js';"],
    ['const build = realAdapters;'],
  ])('ADR-003 the scan finds the builder in %s', (text) => {
    const found = namingTheBuilder([{ path: 'presentation/sneaky.ts', text }]);

    expect(found).toEqual(['presentation/sneaky.ts']);
  });

  it('ADR-003 the adapter builder is named only by the provider composition', async () => {
    const naming = namingTheBuilder(await sourceFiles());

    expect(naming.sort()).toEqual([
      'infrastructure/providers/adapter-builder.ts',
      'presentation/compose-providers.ts',
    ]);
  });

  it('ADR-003 an adapter is constructed only in the adapter builder', async () => {
    const constructing = await filesConstructing([
      'OllamaProvider',
      'OpenAiProvider',
      'AnthropicProvider',
      'FakeProvider',
    ]);

    expect(constructing).toEqual(['infrastructure/providers/adapter-builder.ts']);
  });
});

describe('provider factory boundary: the guards', () => {
  it('ADR-006 the guards and the observer are constructed only where an adapter is wrapped', async () => {
    const constructing = await filesConstructing([
      'BudgetGuard',
      'EgressGuard',
      'ObservedProvider',
    ]);

    expect(constructing).toEqual(['infrastructure/providers/guarded-provider.ts']);
  });

  it('ADR-006 the wrapper builds the guards in the order budget(egress(observed(adapter)))', async () => {
    const wrapper = (await sourceFiles()).find(
      (file) => file.path === 'infrastructure/providers/guarded-provider.ts',
    );
    const text = wrapper?.text ?? '';
    const observed = text.indexOf('new ObservedProvider');
    const egress = text.indexOf('new EgressGuard');
    const budget = text.indexOf('new BudgetGuard');

    expect(observed).toBeGreaterThan(-1);
    expect(egress).toBeGreaterThan(observed);
    expect(budget).toBeGreaterThan(egress);
  });
});
