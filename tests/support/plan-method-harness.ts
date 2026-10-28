import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { loadRecording } from '../../src/infrastructure/providers/fake/recording.js';
import type { BriefAnswers } from '../../src/domain/planning/planning-brief.js';
import { planCards, planQuestions } from './plan-cards.js';
import { createPlanHarness } from './plan-harness.js';
import { shippedCatalogue } from './planning-brief-harness.js';

// RF-607..RF-612: generates a hand-off package for a planning brief, over a seeded understand run
// and the planner's recorded answer, and returns its files by their path inside `handoff/`.

export type PackageFiles = Readonly<Record<string, string>>;

/** The text as a reader sees it: the escaper's backslashes removed. */
export function plain(text: string | undefined): string {
  return (text ?? '').replaceAll('\\', '');
}

/** The catalogue entry with this id, its texts on one line as the package shows them. */
export function entryOf(id: string): (typeof shippedCatalogue.entries)[number] {
  const entry = shippedCatalogue.entries.find((each) => each.id === id);
  if (entry === undefined) throw new Error(`The catalogue has no entry ${id}`);
  const line = (text: string): string => text.replace(/\s+/gu, ' ').trim();
  return { ...entry, rule: line(entry.rule), why: line(entry.why), check: line(entry.check) };
}

/** Every file of the package as one reader-visible text. */
export function allText(files: PackageFiles): string {
  return plain(Object.values(files).join(String.fromCharCode(10)));
}

/** The cards of a task-card file, each from its `## T-nnn` heading. */
export function cardsOf(files: PackageFiles): string[] {
  return allCardsOf(files).filter(
    (card) => !card.includes(migrationTitle) && !foundationTitle.test(card),
  );
}

/** RF-623: the card the plan always starts with when there is a data model; code writes it. */
const migrationTitle = 'Write the database migrations in the chosen stack';

/** P5-42, P6-10: the titles of the fixed and phase-closing cards the plan adds around the planner's cards; code writes them. */
const foundationTitle =
  /solution skeleton and continuous|data-access layer on the chosen|approval-test harness that runs|Migrate the legacy data into|Cut over from the legacy|Verify phase \d+ against its requirements|Review the security of the cards at risk/u;

/** Every task card, the migration card first when the package has one. */
function allCardsOf(files: PackageFiles): string[] {
  return plain(files['tasks.md']).split(/^## /mu).slice(1);
}

/** The decision records of the package by their path, plain text. */
export function decisionsOf(files: PackageFiles): [string, string][] {
  return Object.entries(files)
    .filter(([path]) => path.startsWith('decisions/'))
    .map(([path, text]) => [path, plain(text)]);
}

/** The seeded cards without an `ENT` card: no data model is asked, so the plan has no migration card (P5-38). */
function cardsWithoutEntities(): ReturnType<typeof planCards> {
  return planCards().filter((card) => card.type !== 'ENT');
}

/** Runs `plan` for the brief answers and returns the files of the package. */
export async function packageOf(
  answers: BriefAnswers,
  recording?: Recording,
  cards: ReturnType<typeof planCards> = planCards(),
): Promise<PackageFiles> {
  const dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-method-'));
  try {
    const replayed =
      recording ??
      (await loadRecording(join('tests', 'recordings', 'fake', 'planner-package.json')));
    const h = await createPlanHarness(dataDir, replayed);
    await h.understandRun({ cards, questions: planQuestions });
    await h.saveBrief(answers);
    return await h.handoffOf(await h.plan());
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

/** `packageOf` over the seeded cards without an `ENT` card (P5-38): no data model, so no migration card. */
export function packageWithoutEntities(
  answers: BriefAnswers,
  recording?: Recording,
): Promise<PackageFiles> {
  return packageOf(answers, recording, cardsWithoutEntities());
}
