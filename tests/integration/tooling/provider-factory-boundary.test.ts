import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SecretBox } from '../../../src/application/ports/secret-box.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { err } from '../../../src/domain/errors/result.js';
import { MemoryCostLedger } from '../../../src/infrastructure/db/memory-cost-ledger.js';
import { MemoryProviderKeyRepository } from '../../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../../src/infrastructure/db/memory-server-settings.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { GuardedProviderFactory } from '../../../src/infrastructure/providers/provider-factory.js';
import { budgetTable } from '../../support/budget-harness.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { SequenceIdGenerator } from '../../support/sequence-id-generator.js';

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

/** A box that opens no key, as the evaluation's (it runs on the server keys only). */
const noKeys: SecretBox = {
  keyVersion: 'none',
  knows: () => false,
  seal: () => {
    throw new Error('No keys are stored.');
  },
  open: () => err(ERROR_CODES.providerKeyUnreadable),
};

describe('provider factory boundary: what the provider composition hands out', () => {
  it('ADR-003 ADR-007 exports no adapter builder, only the guarded provider factories', async () => {
    const composition = await import('../../../src/presentation/compose-providers.js');

    expect(Object.keys(composition).sort()).toEqual([
      'composeProviders',
      'evaluationProviderFactory',
    ]);
  });

  it('ADR-003 RNF-006 gives npm run eval the guarded provider factory over the real adapters', async () => {
    const { evaluationProviderFactory } =
      await import('../../../src/presentation/compose-providers.js');
    const clock = new FixedClock('2026-10-17T09:30:00.000Z');
    const masker = new SecretMasker();
    const logger = new MemoryLogger(clock, masker);
    const make = await evaluationProviderFactory(logger);
    const factory = make({
      ...{ keys: new MemoryProviderKeyRepository(), box: noKeys, serverKeys: {} },
      ...{ ollamaUrl: undefined, serverSettings: new MemoryServerSettings({}) },
      ...{ ledger: new MemoryCostLedger(), priceTable: budgetTable, masker, clock, logger },
      ids: new SequenceIdGenerator(),
    });

    expect(factory).toBeInstanceOf(GuardedProviderFactory);
  });
});

describe('provider factory: reasoning models', () => {
  it('Q-58 every factory the composition root builds is given the reasoning models of the shipped list', async () => {
    const files = await sourceFiles();
    const compose = files.find((file) => file.path === 'presentation/compose-providers.ts');

    const blocks = [
      ...(compose?.text.matchAll(/new GuardedProviderFactory\(\{[\s\S]*?\}\);/gu) ?? []),
    ].map((match) => match[0]);

    // The server's factory and the evaluation's factory.
    expect(blocks).toHaveLength(2);
    for (const block of blocks) expect(block).toMatch(/reasoningModels/u);
  });
});
