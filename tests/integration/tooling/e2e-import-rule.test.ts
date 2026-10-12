import { ESLint } from 'eslint';
import { describe, expect, it, vi } from 'vitest';

// RNF-005, P1-13: a spec gets `test` and `expect` from tests/e2e/support/fixtures.ts, because that
// `test` carries the network guard. Importing them from @playwright/test would skip the guard.

// An existing spec path, so the type-aware rules find it in the TypeScript project.
const specPath = 'tests/e2e/smoke.spec.ts';

async function restrictedImports(source: string, filePath = specPath): Promise<string[]> {
  const [result] = await new ESLint({ cwd: process.cwd() }).lintText(source, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.message);
}

// The first lint of a run loads the TypeScript project, which takes a while.
vi.setConfig({ testTimeout: 60_000 });

describe('e2e import rule', () => {
  it.each([
    "import { test } from '@playwright/test';\nexport { test };\n",
    "import { expect } from '@playwright/test';\nexport { expect };\n",
    "import { test as base } from '@playwright/test';\nexport { base };\n",
  ])('RNF-005 refuses test and expect from @playwright/test in a spec: %s', async (source) => {
    const found = await restrictedImports(source);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain('tests/e2e/support/fixtures');
  });

  it('RNF-005 allows types from @playwright/test in a spec', async () => {
    const found = await restrictedImports(
      "import type { Page } from '@playwright/test';\nexport type P = Page;\n",
    );

    expect(found).toEqual([]);
  });

  it('RNF-005 allows the fixtures file itself to import test and expect', async () => {
    const found = await restrictedImports(
      "import { test, expect } from '@playwright/test';\nexport { test, expect };\n",
      'tests/e2e/support/fixtures.ts',
    );

    expect(found).toEqual([]);
  });
});
