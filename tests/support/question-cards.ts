import type { ProjectRef } from '../../src/application/ports/answers-file.js';
import type { MemoryOutputWriter } from './memory-output-writer.js';

// RF-241, data-model.md section 3.7: the `OQ` card files an earlier run left, for tests that need a
// question's state on disk. The header is the data; the index lists the files.

export interface SeededQuestionCard {
  readonly id: string;
  readonly area: string;
  readonly state: 'Open' | 'Answered';
  readonly title?: string;
}

function cardText(card: SeededQuestionCard): string {
  return [
    '---',
    'schemaVersion: 1',
    `id: "${card.id}"`,
    'type: "OQ"',
    `title: "${card.title ?? 'A question'}"`,
    `area: "${card.area}"`,
    'claims:',
    `  - claimId: "${card.id}.c1"`,
    '    text: "The page shows what the list returns."',
    `questionState: "${card.state}"`,
    '---',
    '',
    `# ${card.id} A question`,
    '',
    '## Question',
    '',
    `State: ${card.state}`,
    '',
  ].join('\n');
}

/** Writes the cards of one run (their files and the index) into the memory writer. */
export function seedQuestionCards(
  writer: MemoryOutputWriter,
  project: ProjectRef,
  runKey: string,
  cards: readonly SeededQuestionCard[],
): void {
  const folder = `projects/${project.projectId}/runs/${runKey}`;
  for (const card of cards) writer.files.set(`${folder}/cards/OQ/${card.id}.md`, cardText(card));
  const paths = cards.map((card) => ({ path: `cards/OQ/${card.id}.md` }));
  writer.files.set(`${folder}/cards/index.json`, JSON.stringify({ cards: paths }));
}
