import { describe, expect, it } from 'vitest';
import {
  withAnswersOf,
  type RerunPlan,
} from '../../../../src/application/understand/answer-rerun.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';

// RF-209, RF-241, RF-301, DEC-198, EV-56: an owner's answer reaches the reader as an owner fact with
// the question's area; the lines the question was raised from do not reach it, so a reader has no
// range of the question's context to cite for what the owner said.

const context =
  'Invoice_Generator.xlsm/workbook.md:14-20 The workbook lists the sheets Template and Invoice. (also cited: Invoice_Generator.xlsm/Invoice/values.md:3-9)';

const plan: RerunPlan = {
  project: { userId: 'u-1', projectId: 'p-1' },
  skipped: [],
  baseline: [],
  pending: [
    {
      ...{ cardId: 'OQ-002', runKey: '20261029-100000-understand', area: 'Invoice_Generator.xlsm' },
      question: 'What is the business process flow of the invoice workbook?',
      context,
      answer: 'A clerk fills the Template sheet and the macro copies it into a new invoice.',
    },
  ],
};

const task = (name: string): ReaderTask => ({
  agentTaskId: 'reader-001',
  area: { name, files: ['a.md'], estimatedTokens: 10, mapLevel: 'coarse', origin: 'folder' },
});

describe('the answers text a reader is given', () => {
  it('DEC-198 holds no path:start-end, so no line of the question context is offered', () => {
    const [given] = withAnswersOf([task('Invoice_Generator.xlsm')], plan);

    expect(given?.answers).not.toMatch(/:\d+-\d+/u);
    expect(given?.answers).not.toContain('workbook.md');
    expect(given?.answers).not.toContain('Raised from');
  });

  it('DEC-198 gives the question, the owner answer and the question area as owner facts', () => {
    const [given] = withAnswersOf([task('Invoice_Generator.xlsm')], plan);

    expect(given?.answers).toContain('OQ-002');
    expect(given?.answers).toContain('What is the business process flow of the invoice workbook?');
    expect(given?.answers).toContain('A clerk fills the Template sheet');
    expect(given?.answers).toContain('Area: Invoice_Generator.xlsm');
  });

  it('RF-241 still gives nothing to a task of another area', () => {
    const [given] = withAnswersOf([task('Other')], plan);

    expect(given?.answers).toBeUndefined();
  });
});
