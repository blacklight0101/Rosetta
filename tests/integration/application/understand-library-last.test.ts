import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-200, RF-203, RF-243 (P3-123, HB-01, HB-10): an eShop-shaped project whose library areas sort
// before its own code. The fake provider answers the tasks in the order they are planned, so the
// card of each area shows which task read it.

const temp = useTempRoot('rosetta-library-last-');
const index = z.object({
  cards: z.array(z.object({ id: z.string(), type: z.string(), area: z.string() })),
});

async function eShop(): Promise<string> {
  const root = join(temp.path, 'repository');
  const files: Record<string, string> = {
    'Content/bootstrap.min.css': '.btn{color:red}\n',
    'Scripts/jquery-3.4.1.min.js': '!function(e,t){"use strict";e.fn={}}(window);\n',
    'eShopLegacy/CatalogService.cs': 'class CatalogService\n{\n}\n',
    'eShopModernizedMVC/BasketController.cs': 'class BasketController\n{\n}\n',
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), text, 'utf8');
  }
  return root;
}

async function cardsOf(request: { areas?: string[] }): Promise<readonly string[]> {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    repository: await eShop(),
    recording: 'understand-eshop-library.json',
  });
  await h.scan();
  const run = await h.understand(request);
  expect(run.endState).toBe('Completed');
  const found = index.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
  return found.cards.map((card) => `${card.id} ${card.area}`);
}

describe('an eShop-shaped run with library areas', UNDERSTAND_TIMEOUT, () => {
  it('RF-200 without an area list reads the own code only', async () => {
    expect(await cardsOf({})).toEqual(['FEAT-001 eShopLegacy', 'FEAT-002 eShopModernizedMVC']);
  });

  it('RF-200 RF-203 RF-243 reads own code first, ids follow, and a library card that only says so is not written', async () => {
    const areas = ['Content', 'Scripts', 'eShopLegacy', 'eShopModernizedMVC'];

    // The Content and Scripts answers only describe library code, so no card is written for them.
    expect(await cardsOf({ areas })).toEqual([
      'FEAT-001 eShopLegacy',
      'FEAT-002 eShopModernizedMVC',
    ]);
  });
});
