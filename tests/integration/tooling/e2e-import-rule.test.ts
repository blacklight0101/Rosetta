import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// RNF-005, P1-13: a spec gets `test` and `expect` from tests/e2e/support/fixtures.ts, because that
// `test` carries the network guard. Importing them from @playwright/test would skip the guard.

const specPath = 'tests/e2e/smoke.spec.ts';
// One instance for the file: each new instance loads the configuration again. no-restricted-imports
// needs no type information, so the type-aware rules are switched off and no TypeScript project loads.
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfig: [
    {
      ...tseslint.configs.disableTypeChecked,
      files: ['tests/e2e/**/*.ts'],
      languageOptions: { parserOptions: { projectService: false } },
    },
  ],
});

async function restrictedBy(
  ruleId: string,
  source: string,
  filePath = specPath,
): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === ruleId)
    .map((message) => message.message);
}

const restrictedImports = (source: string, filePath = specPath): Promise<string[]> =>
  restrictedBy('no-restricted-imports', source, filePath);

describe('e2e import rule', () => {
  it.each([
    "import { test } from '@playwright/test';\nexport { test };\n",
    "import { expect } from '@playwright/test';\nexport { expect };\n",
    "import { test as base } from '@playwright/test';\nexport { base };\n",
    "import pw from '@playwright/test';\nexport { pw };\n",
  ])(
    'RNF-005 refuses test, expect and the default export of @playwright/test in a spec: %s',
    async (source) => {
      const found = await restrictedImports(source);

      expect(found).toHaveLength(1);
      expect(found[0]).toContain('tests/e2e/support/fixtures');
    },
  );

  it('RNF-005 allows types from @playwright/test in a spec', async () => {
    const found = await restrictedImports(
      "import type { Page } from '@playwright/test';\nexport type P = Page;\n",
    );

    expect(found).toEqual([]);
  });
});

describe('e2e dynamic import rule', () => {
  it.each([
    "export async function load() {\n  return await import('./helper.js');\n}\n",
    "export async function load() {\n  return await import('@playwright/test');\n}\n",
  ])('RNF-005 refuses a dynamic import() in a spec: %s', async (source) => {
    const found = await restrictedBy('no-restricted-syntax', source);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain('RNF-005');
  });

  it('RNF-005 allows a static import of a helper in a spec', async () => {
    const found = await restrictedBy(
      'no-restricted-syntax',
      "import { helper } from './helper.js';\nexport { helper };\n",
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
