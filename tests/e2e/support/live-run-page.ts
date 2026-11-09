import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';
import { revealAreas, showStartPage, type StartPageState } from './start-choices.js';

// RF-1002, RF-1003, RF-1004, P1-35: what the live run journeys do on the start page and on the live
// page, so the specs read as steps. The repository is `octo/webforms` (serve.ts), the C# fixture whose
// recorded understand run the test server replays.

const webformsUrl = 'https://github.com/octo/webforms';
const startButton = { name: /^Analyse/u } as const;

/** The start link of the project of a repository address on the projects page. */
function startLinkOf(page: Page, url: string): Locator {
  return page.getByRole('link', { name: `Open for ${new URL(url).pathname.slice(1)}` });
}

/** The heading of the start page of a project. */
function startHeadingOf(page: Page): Locator {
  return page.getByRole('heading', { name: 'Start a run', level: 1 });
}

/**
 * Makes sure the account has the project of a repository address, creating it when it has not.
 * A create has one of two answers, and the page waits for it where it was made (P1-150): the project
 * is added to this list, or the project already exists and the form opens its start page. Reloading
 * during the create could cancel it, or let its navigation land after the reload, so no reload is
 * made here.
 */
export async function ensureProject(page: Page, url: string): Promise<void> {
  const link = startLinkOf(page, url);
  const empty = page.getByText('No projects yet');
  await expect(link.or(empty).or(page.getByRole('table')).first()).toBeVisible();
  if ((await link.count()) > 0) return;
  await page.getByLabel('GitHub repository URL').fill(url);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(link.or(startHeadingOf(page))).toBeVisible({ timeout: 30_000 });
}

/**
 * Opens the start page of the account's project for a repository address, creating the project
 * first. The page is either on the start page already (the answer of a create that found the project)
 * or on the projects list, where the link leads to it.
 */
export async function openStartOf(page: Page, url: string): Promise<void> {
  await ensureProject(page, url);
  if (await startHeadingOf(page).isVisible()) return;
  const link = startLinkOf(page, url);
  await expect(link).toHaveAttribute('href', /\/projects\/[^/]+$/u);
  await page.goto((await link.getAttribute('href')) ?? '/projects');
}

/**
 * Opens the start page of the account's `octo/webforms` project, creating the project once.
 * `scanning` leaves the page while its own scan runs (RF-160); the default waits until it ended.
 */
export async function openStartPage(page: Page, state: StartPageState = 'settled'): Promise<void> {
  await page.goto('/projects');
  await openStartOf(page, webformsUrl);
  // P8-26: a project with a run is titled with its name, not "Start a run".
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(webformsUrl);
  await showStartPage(page, state);
}

/** The area checkboxes of the start page. */
function areasOf(page: Page): Locator {
  return page.getByRole('group', { name: 'Areas from the code map' });
}

/** Chooses which areas an understand run reads: only the ones named. */
async function chooseAreas(page: Page, names: readonly string[]): Promise<void> {
  const areas = areasOf(page);
  await revealAreas(page);
  await expect(areas.locator('label').first()).toBeVisible();
  for (const label of await areas.locator('label').allTextContents()) {
    const name = label.trim();
    await areas.getByLabel(name, { exact: true }).setChecked(names.includes(name));
  }
}

/**
 * Presses Start; when the likely cost is above the confirm threshold (RF-425) the run is asked
 * about first, and the question is confirmed.
 */
export async function pressStart(page: Page): Promise<void> {
  await page.getByRole('button', startButton).click();
  const question = page.getByRole('dialog', { name: 'Start this run?' });
  const live = page.getByRole('heading', {
    name: /^(Scan|Understand|Deepen|Plan|Run)\b/u,
    level: 1,
  });
  await expect(question.or(live)).toBeVisible();
  if (await question.isVisible()) {
    await page.getByRole('button', { name: 'Confirm and start' }).click();
  }
}

/**
 * Presses Analyse; the browser opens the live page of the run by itself (RF-1019), so there is no
 * link to click. Returns the path of the live page.
 */
export async function startAndOpenLiveRun(page: Page): Promise<string> {
  await pressStart(page);
  await expect(
    page.getByRole('heading', { name: /^(Scan|Understand|Deepen|Plan|Run)\b/u, level: 1 }),
  ).toBeVisible();
  return new URL(page.url()).pathname;
}

/**
 * RF-160: the free scan starts by itself when the project has a source. Waits until it ended and
 * the areas are listed, then opens the live page of the scan run through the History page.
 */
export async function openScanRun(page: Page): Promise<void> {
  await revealAreas(page);
  await expect(areasOf(page).locator('label').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('scan-running')).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('navigation').getByRole('link', { name: 'History' }).click();
  await page
    .getByRole('link', { name: /^View run .*-scan$/u })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: /^(Scan|Understand|Deepen|Plan|Run)\b/u, level: 1 }),
  ).toBeVisible();
  // A scan run is never partly read, so its head reads "Completed" (P8-138).
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
}

/** Starts an understand run of the named areas and opens its live page. */
export async function startUnderstand(page: Page, areas: readonly string[]): Promise<string> {
  await openStartPage(page);
  await chooseAreas(page, areas);
  return startAndOpenLiveRun(page);
}

export function agentPanel(page: Page, area: string): Locator {
  return page.getByRole('article', { name: `Agent ${area}`, exact: true });
}

/** The value beside a label in a definition list, for example `Turns` of a panel. */
export function valueOf(scope: Locator, label: string): Locator {
  return scope.locator(`dt:text-is("${label}") + dd`);
}

/**
 * P8-93: how an ended understand run reads in the head of its page: "Completed", or, when the run
 * read an area below the coverage bar (as the recorded small apps do), "Partly read: 67% of your code".
 */
export const RUN_DONE = /Completed|Partly read: \d+% of your code/u;

/**
 * P8-138: an understand run that ended `Completed`, every area finished. RUN_DONE alone also matches a
 * run its cap stopped early with areas unread ("Partly read" too), so the end state is read as well.
 */
export async function expectCompleted(page: Page, timeout: number): Promise<void> {
  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout });
  await expect(runStatus(page)).toHaveAttribute('data-end-state', 'Completed');
}

export function runStatus(page: Page): Locator {
  return page.getByTestId('run-status');
}

/**
 * Opens a tab of the page of a run: the cards so far, all agents or the activity while the run works
 * (P1-169), and the overview, your questions, the evidence or the activity once it has ended (P1-170).
 */
export async function openRunTab(
  page: Page,
  name: 'Cards so far' | 'All agents' | 'Activity' | 'Overview' | 'Your questions' | 'Evidence',
): Promise<void> {
  const tab = page.getByRole('tab', { name: new RegExp(`^${name}`, 'u') });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/**
 * RF-264, P3-81: "What was not covered" of the finished run. Controllers was not asked for; the
 * rejected claim of Services leaves it with no card that passed; the files no reader opened are
 * named, with the share of first-party tokens and the Deepen step, and the old sentence is gone.
 */
export async function expectNotCovered(covered: Locator): Promise<void> {
  await expect(covered).toContainText(/Not selected for this run \(1\)\s*Controllers/u);
  await expect(covered).toContainText(
    /No card was left after the citation check and the judgement \(1\)\s*Services/u,
  );
  const unread = /First-party files not read: \d+ files?, \d+% of first-party tokens not read\./u;
  await expect(covered).toContainText(unread);
  await expect(covered).toContainText('Next step: run a Deepen to read');
  await expect(covered).not.toContainText('Every area of the run gave at least one card.');
}

/** RF-1007: the open question with that card id on the page of a finished run. */
export function openQuestion(page: Page, cardId: string): Locator {
  return page
    .getByRole('region', { name: 'Open questions' })
    .getByTestId('open-question')
    .filter({ hasText: cardId });
}

/**
 * RF-645: the question lists its suggested answers, the recommended one first, and "Type your own
 * answer" last; the second option is chosen with the arrow key and saved, with the keyboard alone.
 */
export async function chooseSecondSuggestedAnswer(question: Locator): Promise<void> {
  const radios = question.getByRole('radio');
  await expect(radios).toHaveCount(4);
  await expect(radios.first()).toHaveAccessibleName(/^\(Recommended\) /u);
  await expect(radios.last()).toHaveAccessibleName('Type your own answer');
  await expect(question.getByRole('textbox')).toHaveCount(0);
  await radios.first().focus();
  await question.page().keyboard.press('ArrowDown');
  await expect(radios.nth(1)).toBeChecked();
  await saveWithKeyboard(question);
  // The choice is in answers.md: the page shows it again after a reload.
  await question.page().reload();
  await openRunTab(question.page(), 'Your questions');
  // P8-85: the saved question is in the closed Answered list, where role queries find nothing.
  await showQuestion(question);
  await expect(radios.nth(1)).toBeChecked();
}

/** RF-1007 (P8-86): the one "Save answers (N)" of the Your questions list. */
export function saveAnswersButton(page: Page): Locator {
  return page
    .getByRole('region', { name: 'Open questions' })
    .getByRole('button', { name: /^Save answers \(\d+\)$/u });
}

/** RF-1007 (P8-86): presses the list's Save answers, which saves every changed answer at once. */
export async function saveAnswers(page: Page): Promise<void> {
  await saveAnswersButton(page).click();
}

/** RF-645, P8-86: the one changed answer is counted, and Enter on "Save answers (1)" saves it. */
async function saveWithKeyboard(question: Locator): Promise<void> {
  const page = question.page();
  const save = saveAnswersButton(page);
  await expect(save).toHaveText('Save answers (1)');
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(question).toContainText('Answer saved in answers.md.');
}

/** RF-1007 (P8-85): a question with a saved answer is in the collapsed Answered list; open the list. */
async function showQuestion(question: Locator): Promise<void> {
  await expect(question).toHaveCount(1);
  if (!(await question.isVisible())) {
    await question.page().getByTestId('answered-questions').locator('summary').click();
  }
  await expect(question).toBeVisible();
}

/**
 * RF-645: the arrow keys reach "Type your own answer", Tab goes to its field, the text replaces
 * what the field holds and the answer is saved, all with the keyboard.
 */
export async function typeOwnAnswerWithKeyboard(question: Locator, answer: string): Promise<void> {
  const { keyboard } = question.page();
  const radios = question.getByRole('radio');
  await showQuestion(question);
  await radios.first().focus();
  await keyboard.press('ArrowDown');
  await keyboard.press('ArrowDown');
  await keyboard.press('ArrowDown');
  await expect(radios.last()).toBeChecked();
  await keyboard.press('Tab');
  await expect(question.getByLabel('Answer to OQ-001')).toBeFocused();
  await keyboard.press('Control+A');
  await keyboard.type(answer);
  await saveWithKeyboard(question);
}
