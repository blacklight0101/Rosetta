import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { FileAnswersFile } from '../../../src/infrastructure/cards/answers-file.js';
import { NodeOutputWriter } from '../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { e2ePort } from './server-config.js';

// GENERATED QUESTIONS ONLY (RNF-003), RF-647, P8-16: the recorded understand run of the plan
// specs finds no open question, so the one-click case would be covered by the unit test only.
// This writes three open questions, with suggested answers, into the project's answers.md under
// the run, through the same file adapter the server uses. The page then reads them through its
// own answers route, as for a run that asked them.

const dataDir = (): string => join(tmpdir(), `rosetta-e2e-${String(e2ePort())}`);

const runRow = z.object({ projectId: z.string(), runId: z.string() });

export const seededQuestions = [
  'Is the catalogue shown to visitors who are not signed in?',
  'Who may change the price of an item?',
  'Is a product kept when its category is removed?',
] as const;

const options = (yes: string) => [
  { answer: yes, description: 'The usual reading.', recommended: true },
  { answer: 'No', description: 'The other reading.', recommended: false },
];

/** Adds three open questions to the run (the UUID in its live page address) of the signed-in user. */
export async function seedThreeOpenQuestions(page: Page, runUuid: string): Promise<void> {
  const body: unknown = await page.evaluate(async (path) => {
    const response = await fetch(path);
    const answer: unknown = await response.json();
    return answer;
  }, `/api/runs/${runUuid}`);
  const { projectId, runId } = runRow.parse(body);
  const users = join(dataDir(), 'users');
  let userId: string | undefined;
  for (const each of await readdir(users)) {
    const found = await readdir(join(users, each, 'projects', projectId, 'runs', runId)).then(
      () => true,
      () => false,
    );
    if (found) userId = each;
  }
  if (userId === undefined) throw new Error(`The folder of run ${runUuid} was not found.`);
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  const answers = new FileAnswersFile({
    writer: new NodeOutputWriter({ dataDir: dataDir(), logger }),
    masker,
  });
  await answers.addQuestions(
    { userId, projectId },
    seededQuestions.map((question, index) => ({
      cardId: `OQ-00${String(index + 1)}`,
      runKey: runId,
      question,
      context: `Catalog/Default.aspx.cs:${String(40 + index)} decides it.`,
      options: options(index === 1 ? 'Administrators only' : 'Yes'),
    })),
  );
}
