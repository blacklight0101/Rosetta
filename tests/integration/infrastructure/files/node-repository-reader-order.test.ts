import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeRepositoryReader } from '../../../../src/infrastructure/files/node-repository-reader.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { writeTree } from '../../../support/snapshot-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-146, RF-104, P1-160: a grep spends its byte budget on the repository's own files first; source
// maps and vendored or minified scripts (the third-party rule of the code map) come last. The tree
// is shaped like an ASP.NET MVC application such as eShopModernizing: large `.map` files and
// library scripts whose paths sort before the C# source.

const temp = useTempRoot('rosetta-reader-order-');
const app = 'src/eShopLegacyMVC';

function snapshotRoot(): string {
  return join(
    temp.path,
    'sources',
    'owner__repo@0123456789abcdef0123456789abcdef01234567',
    'files',
  );
}

/** A file of about `bytes` bytes that holds the needle once. */
function filler(bytes: number): string {
  return `${'// generated\n'.repeat(Math.floor(bytes / 13))}var needle = 1;\n`;
}

const thirdParty: Record<string, string> = {
  [`${app}/Content/bootstrap.css.map`]: filler(8000),
  [`${app}/Content/bootstrap-grid.css.map`]: filler(8000),
  [`${app}/Bundles/app.bundle.js.map`]: filler(8000),
  [`${app}/Bundles/vendor.min.js`]: filler(8000),
  [`${app}/Scripts/jquery-3.4.1.js`]: filler(8000),
  [`${app}/Scripts/bootstrap.bundle.js`]: filler(8000),
  [`${app}/Scripts/modernizr-2.8.3.js`]: filler(8000),
};

const names = ['Catalog', 'Pics', 'Home', 'Orders', 'Basket', 'Account'];
const sourceEntries: [string, string][] = [
  ...names.map((name): [string, string] => [
    `${app}/Controllers/${name}Controller.cs`,
    'public class C { int needle; }\n',
  ]),
  ...names.map((name): [string, string] => [
    `${app}/Models/${name}Item.cs`,
    'public class M { int needle; }\n',
  ]),
  [`${app}/Scripts/app/catalog.js`, 'var needle = 2;\n'],
];
const source: Record<string, string> = Object.fromEntries(sourceEntries);

/** The bytes of the third-party files whose paths sort before the C# source, plus 100. */
const tightBudget =
  [
    `${app}/Bundles/app.bundle.js.map`,
    `${app}/Bundles/vendor.min.js`,
    `${app}/Content/bootstrap-grid.css.map`,
    `${app}/Content/bootstrap.css.map`,
  ].reduce((total, path) => total + Buffer.byteLength(thirdParty[path] ?? ''), 0) + 100;

async function openReader(
  budget: number,
  files: Record<string, string> = { ...thirdParty, ...source },
): Promise<NodeRepositoryReader> {
  await writeTree(snapshotRoot(), files);
  return NodeRepositoryReader.open({
    root: snapshotRoot(),
    ignoreRules: '',
    allowDenied: [],
    logger: new MemoryLogger(new FixedClock('2026-10-14T09:00:00.000Z'), new SecretMasker()),
    grepMaxTotalBytes: budget,
  });
}

describe('NodeRepositoryReader grep order', () => {
  it('RF-146 the source files are searched before source maps and library scripts take the budget', async () => {
    const reader = await openReader(tightBudget);

    const result = await reader.grep({ pattern: 'needle' });

    const found = result.ok ? result.value.matches.map((match) => match.path) : [];
    expect(found.filter((path) => path in source).sort()).toEqual(Object.keys(source).sort());
    expect(found.filter((path) => path in thirdParty)).toHaveLength(3);
    expect(result.ok && result.value.notice).toContain('4 file(s) were not searched');
  });

  it('RF-146 with room for everything every file is searched and the answer is in path order', async () => {
    const reader = await openReader(1_000_000);

    const result = await reader.grep({ pattern: 'needle' });

    const found = result.ok ? result.value.matches.map((match) => match.path) : [];
    expect(found).toEqual(Object.keys({ ...thirdParty, ...source }).sort());
    expect(result.ok && result.value.notice).toBeUndefined();
  });

  it('RF-146 a vendored library script is read after the own scripts, even with no source map', async () => {
    const library = thirdParty[`${app}/Scripts/jquery-3.4.1.js`] ?? '';
    const own = { [`${app}/Scripts/site.js`]: 'var needle = 3;\n' };
    const reader = await openReader(Buffer.byteLength(library) + 10, {
      [`${app}/Scripts/jquery-3.4.1.js`]: library,
      ...own,
    });

    const result = await reader.grep({ pattern: 'needle' });

    expect(result.ok && result.value.matches.map((match) => match.path)).toEqual(Object.keys(own));
  });

  it('RF-146 a source map is read after the own files, even outside a library folder', async () => {
    const map = thirdParty[`${app}/Content/bootstrap.css.map`] ?? '';
    const own = { [`${app}/Controllers/HomeController.cs`]: 'int needle;\n' };
    const reader = await openReader(Buffer.byteLength(map) + 10, {
      [`${app}/Content/bootstrap.css.map`]: map,
      ...own,
    });

    const result = await reader.grep({ pattern: 'needle' });

    expect(result.ok && result.value.matches.map((match) => match.path)).toEqual(Object.keys(own));
  });
});
