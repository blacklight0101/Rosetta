import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import type { OpenQuestion } from '../../../../src/application/ports/answers-file.js';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { draftOf, oqDraft } from '../../../support/card-fixtures.js';
import { cardsOf, fileOf, writeCards } from '../../../support/card-output-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// P3-128 (RF-141, RF-145; P3-127): a setting between backslash-escaped quotes in model text is
// masked in a card file (the header still parses as YAML) and in answers.md. Synthetic values only.

const bs = String.fromCharCode(92);
const eq = `${bs}"`;
const fakePassword = 'FAKE-pw-0000';
const text = `Password=${eq}${fakePassword}${eq} and ${eq}x${eq}`;

function headerOf(file: string): string {
  return file.split('\n---\n')[0]?.replace(/^---\n/, '') ?? '';
}

describe('a card file masks a value between escaped quotes', () => {
  it('RF-141 masks it in the header and the body, and the header still parses', async () => {
    const claim = { text, citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }] };
    const base = { title: text, summary: text, claims: [claim] };
    const tasks = [
      { agentTaskId: 't', area: 'orders', drafts: [draftOf(base), { ...oqDraft(), ...base }] },
    ];

    const { writer } = await writeCards(cardsOf(tasks));

    for (const file of writer.files.values()) {
      expect(file).not.toContain(fakePassword);
    }
    const card = fileOf(writer, 'cards/FEAT/FEAT-001.md');
    expect(card).toContain('MASKED:password');
    const header = parse(headerOf(card)) as { title: string };
    expect(header.title).toContain('MASKED:password');
    expect(header.title).toContain('and');
  });
});

describe('answers.md masks a value between escaped quotes', () => {
  const project = {
    userId: '00000000-0000-4000-9000-0000000000a1',
    projectId: '00000000-0000-4000-a000-0000000000c1',
  };
  const path = `projects/${project.projectId}/answers.md`;
  const runKey = '20261012-100000-understand';
  const question: OpenQuestion = { cardId: 'OQ-001', runKey, question: text, context: text };

  it('RF-141 masks a question, its context and an answer', async () => {
    const writer = new MemoryOutputWriter();
    const answers = new FileAnswersFile({ writer, masker: new SecretMasker() });

    await answers.addQuestions(project, [question]);
    const result = await answers.recordAnswers(project, runKey, [
      { cardId: 'OQ-001', answer: text },
    ]);

    expect(result.ok).toBe(true);
    const file = writer.files.get(path) ?? '';
    expect(file).not.toContain(fakePassword);
    expect(file).toContain(`Password=${eq}[MASKED:password]${eq}`);
  });
});
