import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { saveBrief, understandFromUrl, writeAndDownload } from '../support/handoff-journey.js';
import { openStep } from '../support/plan-setup-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import {
  brokenLinks,
  cardModels,
  frontMatterOf,
  headingsOf,
  readingOrderTargets,
  type Files,
} from '../../support/package-reading.js';

// RF-612, RF-635, RF-639..RF-643, P6-12: the build method through the pages. Each journey scans and
// understands the Catalog area, chooses "Agents will build" and an agent tool in Plan setup, writes
// the package and downloads the zip, then reads it as a new agent would: AGENTS.md first, then
// orchestration.md, a model on every card, a clean model check and the agent files of the tool.
// The server's fake provider replays recordings only (ADR-008); the single-file app itself is
// covered by tests/integration/application/build-plan-method-end-to-end.test.ts.

/** The files of the zip by their path inside the package folder, wherever the zip puts it. */
function rootless(files: Readonly<Record<string, string>>): Files {
  const readme = Object.keys(files).find(
    (path) => path === 'README.md' || path.endsWith('/README.md'),
  );
  const prefix = readme === undefined ? '' : readme.slice(0, readme.length - 'README.md'.length);
  return Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, text]) => [path.slice(prefix.length), text]),
  );
}

function expectMethodPackage(files: Files, models: Readonly<Record<string, string>>): void {
  expect(readingOrderTargets(files).slice(0, 2)).toEqual(['AGENTS.md', 'orchestration.md']);
  expect(headingsOf(files['orchestration.md'])).toEqual(
    expect.arrayContaining([
      ...['Roles', 'Bands and models', 'Retry ladder', 'Human gates', 'Usage throttle'],
      ...['Escalation and stop conditions', 'Size budgets of living files'],
    ]),
  );
  const cards = cardModels(files);
  expect(cards.length).toBeGreaterThan(0);
  for (const card of cards) expect(card.model).toBe(models[card.tier]);
  expect(files['checks.md']).not.toContain('## Model of each card');
  expect(brokenLinks(files)).toEqual([]);
}

test('RF-612 RF-639 RF-641 RF-642 a package for Claude Code: agents with front matter, the default models, a clean check', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await signInThroughPage(page, accountFor('journey-run', `${info.project.name}/method-claude`));
  await understandFromUrl(page);

  await openStep(page, 'Build method');
  await page.getByRole('radio', { name: /^Agents will build/u }).check();
  await page.getByRole('radio', { name: /^Claude Code/u }).check();
  await saveBrief(page);
  await expectNoSeriousViolations(page);
  const files = rootless(await writeAndDownload(page));

  expectMethodPackage(files, { smallest: 'haiku', middle: 'sonnet', largest: 'opus' });
  const builder = frontMatterOf(files['agents/builder-middle.md']) ?? [];
  expect(builder.join('\n')).toMatch(/^model: "?sonnet"?$/mu);
  expect(files['agents/README.md']).toContain('.claude/agents/');
});

test('RF-612 RF-639 RF-641 RF-642 a package for Codex: the models typed in Plan setup, plain role prompts', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await signInThroughPage(page, accountFor('journey-run', `${info.project.name}/method-codex`));
  await understandFromUrl(page);

  await openStep(page, 'Build method');
  await page.getByRole('radio', { name: /^Agents will build/u }).check();
  await page.getByRole('radio', { name: /^Codex/u }).check();
  await page.getByLabel(/^Smallest tier/u).fill('gpt-small');
  await page.getByLabel(/^Middle tier/u).fill('gpt-mid');
  await page.getByLabel(/^Largest tier/u).fill('gpt-large');
  await saveBrief(page);
  const files = rootless(await writeAndDownload(page));

  expectMethodPackage(files, { smallest: 'gpt-small', middle: 'gpt-mid', largest: 'gpt-large' });
  expect(frontMatterOf(files['agents/builder-middle.md'])).toBeUndefined();
  expect(files['agents/README.md']).toContain('gpt-mid');
  expect(Object.keys(files).some((path) => path.startsWith('.claude/'))).toBe(false);
});
