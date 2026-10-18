import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { buildReport } from '../support/journey-pages.js';
import {
  downloadedRunFiles,
  scanAndChooseModels,
  understandEveryArea,
} from '../support/full-run-pages.js';
import { consolidateModel } from '../support/journey-models.js';
import { openRunTab } from '../support/live-run-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';

// RF-250, RF-262, RF-300, RF-301, ADR-010, P2-13: consolidation seen from the pages (flow 2).
// Two areas describe the same entity and two others state different rules about one item; after
// the readers have ended the summariser merges each pair into one card that keeps every claim
// and citation, and the merge is recorded. The journey runs every area, reads the merged cards in
// the claims of the run page, in the Markdown report and in the specification of the run folder,
// and checks that no card of the pair is left. The model double replays
// `understand-consolidate.json` and the summariser's recorded merges (e2e-provider.ts).

const claimIds = (page: Parameters<typeof openRunTab>[0]) =>
  page.getByRole('region', { name: 'Claims' }).getByTestId('claim');

// RF-250, P1-174: the card list follows the merge too: each merged card once, none of the pair,
// also after a reload.
async function expectMergedCardsListed(page: Parameters<typeof openRunTab>[0]): Promise<void> {
  const cards = page.getByTestId('card-row');
  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
      await openRunTab(page, 'Evidence');
    }
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: 'ENT-001' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'BR-001' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'ENT-002' })).toHaveCount(0);
    await expect(cards.filter({ hasText: 'BR-002' })).toHaveCount(0);
  }
}

test('RF-250 RF-262 the cards two areas wrote about one entity and one rule are merged: the page, the report and the specification show each once', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await scanAndChooseModels(page, { reader: consolidateModel, summariser: consolidateModel });

  await understandEveryArea(page);

  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await openRunTab(page, 'Evidence');
  const claims = claimIds(page);
  await expect(claims).toHaveCount(5);
  for (const id of ['BR-001.c1', 'BR-001.c2', 'ENT-001.c1', 'ENT-001.c2', 'ENT-001.c3']) {
    await expect(claims.filter({ hasText: id })).toHaveCount(1);
  }
  await expect(claims.filter({ hasText: 'ENT-002' })).toHaveCount(0);
  await expect(claims.filter({ hasText: 'BR-002' })).toHaveCount(0);
  await expectMergedCardsListed(page);

  const files = await downloadedRunFiles(page);
  const spec = files['spec.md'] ?? '';
  expect(spec).toContain('### ENT-001 Catalog item');
  expect(spec).toContain('### BR-001 Catalog item name and lookup');
  expect(spec).not.toContain('ENT-002');
  expect(spec).not.toContain('BR-002');
  expect(spec).toContain('(1 entity)');
  for (const cited of ['Database/schema.sql:2-6', 'Services/CatalogService.cs:7-7']) {
    expect(spec).toContain(cited);
  }
  const entity = files['cards/ENT/ENT-001.md'] ?? '';
  expect(entity).toMatch(/mergedFrom:\n\s+- "ENT-001"\n\s+- "ENT-002"/u);
  expect(entity).toMatch(/mergedAreas:\n\s+- "Database"\n\s+- "Services"/u);
  expect(Object.keys(files).filter((name) => name.startsWith('cards/ENT/'))).toEqual([
    'cards/ENT/ENT-001.md',
  ]);

  await buildReport(page);
  await page.getByRole('link', { name: 'Open the report as Markdown' }).click();
  const report = page.locator('body');
  await expect(report).toContainText('2 cards, 5 claims: 4 Supported, 1 Rejected.');
  await expect(report).toContainText('Catalog item name and lookup');
  await expect(report).not.toContainText('Stock item');
  await expect(report).not.toContainText('Details page shows a fixed name');
});
