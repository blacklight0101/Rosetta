import { describe, expect, it } from 'vitest';
import type { OpenQuestion } from '../../../../src/application/ports/answers-file.js';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  backslash,
  fakePassword,
  fakeToken,
  lineTerminators,
  passwordOption,
  tokenOption,
} from '../../../support/continuation-breaks.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-240, RF-141, RNF-003, P2-42: the text of answers.md is masked as the model or the owner wrote
// it, before its whitespace is collapsed onto one line, so a secret on the line after a shell line
// continuation is still masked.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const path = `projects/${project.projectId}/answers.md`;
const runKey = '20261012-100000-understand';

function question(text: string, context: string): OpenQuestion {
  return { cardId: 'OQ-001', runKey, question: text, context };
}

function setup() {
  const writer = new MemoryOutputWriter();
  return { writer, answers: new FileAnswersFile({ writer, masker: new SecretMasker() }) };
}

describe('answers.md masks before it reshapes', () => {
  it.each(lineTerminators)(
    'RF-240 masks a question and context with a continuation and $name',
    async ({ value }) => {
      const { writer, answers } = setup();
      const text = `Why does it run ${passwordOption} ${backslash}${value}  ${fakePassword} here?`;
      const context = `Deploy.sh:1-4 ${tokenOption} Bearer ${backslash}${value}${fakeToken}`;

      await answers.addQuestions(project, [question(text, context)]);

      const file = writer.files.get(path) ?? '';
      expect(file).not.toContain(fakePassword);
      expect(file).not.toContain(fakeToken);
      expect(file).toContain('[MASKED:password]');
    },
  );

  it.each(lineTerminators)(
    'RF-1007 masks an answer with a continuation and $name',
    async ({ value }) => {
      const { writer, answers } = setup();
      await answers.addQuestions(project, [question('Which flag?', 'A.sh:1-2 flags')]);

      const result = await answers.recordAnswers(project, runKey, [
        {
          cardId: 'OQ-001',
          answer: `Use ${passwordOption} ${backslash}${value}${fakePassword} always`,
        },
      ]);

      expect(result.ok).toBe(true);
      expect(writer.files.get(path) ?? '').not.toContain(fakePassword);
    },
  );
});
