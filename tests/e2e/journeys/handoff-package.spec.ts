import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import {
  decisionsOf,
  defaultedBriefIds,
  packageFile,
  plainFile,
  projectContextIds,
  saveBrief,
  understandFromUrl,
  untracedRequirements,
  writeAndDownload,
} from '../support/handoff-journey.js';
import { estimate, openStep, recorded } from '../support/plan-setup-page.js';
import { transitionsDone } from '../support/transitions.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';

// RF-010, RF-601, RF-604, RF-605, RF-610, RF-611, RF-612, RNF-005, P3-12: the release 1 journeys,
// flows 1 and 7 of docs/process-flows.md end to end through the pages and the real server. Each
// starts from the address of a public GitHub repository (the test server's fake GitHub serves the
// recorded snapshot of the C# fixture, no network), scans it, understands its Catalog area, saves a
// planning brief in Plan setup, writes the package and downloads the hand-off zip. Every model
// answer is a recording (e2e-provider.ts). The two journeys differ only in the brief, so what the
// package says about the choices must come from the saved brief.

test('RF-604 RF-610 RF-611 from a GitHub URL to a downloaded hand-off package that follows the saved brief', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await understandFromUrl(page);

  await openStep(page, 'Migration');
  await page.getByRole('radio', { name: /^Parallel Change/u }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('Your own for Hosting').fill('On-premises Kubernetes');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('radio', { name: /^Agents will build/u }).check();
  await page.getByRole('radio', { name: /^Claude Code/u }).check();
  await saveBrief(page);
  await expect(recorded(page)).toContainText('Parallel Change');
  await expect(recorded(page)).toContainText('Agents will build with Claude Code');
  await page.reload();
  await expect(recorded(page)).toContainText('Parallel Change');
  await expect(estimate(page)).not.toHaveAttribute('aria-busy', 'true');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  const files = await writeAndDownload(page);

  expect(packageFile(files, 'README.md')).toContain('](prd.md)');
  const decisions = decisionsOf(files);
  expect(decisions).toContain('Migration strategy: Parallel Change');
  expect(decisions).toContain('Technology for the hosting layer: On-premises Kubernetes');
  expect(plainFile(files, 'AGENTS.md')).toContain('On-premises Kubernetes');
  expect(defaultedBriefIds(files)).not.toContain('migration');
  expect(defaultedBriefIds(files)).not.toContain('stack.hosting');
  expect(defaultedBriefIds(files)).toEqual(expect.arrayContaining([...projectContextIds]));
  expect(untracedRequirements(files)).toEqual([]);
});

test('RF-601 RF-605 RF-612 a brief saved with every default gives a package that lists the defaults it took', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await signInThroughPage(page, accountFor('journey-run', `${info.project.name}/defaults`));
  await understandFromUrl(page);

  await openStep(page, 'Build method');
  await saveBrief(page);
  await expect(recorded(page).getByText('(default)').first()).toBeVisible();

  const files = await writeAndDownload(page);

  expect(packageFile(files, 'README.md')).toContain('](prd.md)');
  const decisions = decisionsOf(files);
  expect(decisions).toContain('Migration strategy: Strangler Fig');
  expect(decisions).toContain('Technology for the hosting layer');
  expect(decisions).toContain('Rosetta proposes');
  expect(defaultedBriefIds(files)).toContain('migration');
  expect(defaultedBriefIds(files)).toEqual(expect.arrayContaining([...projectContextIds]));
  expect(untracedRequirements(files)).toEqual([]);
  expect(Object.keys(files).some((path) => path.endsWith('AGENTS.md'))).toBe(false);
});
