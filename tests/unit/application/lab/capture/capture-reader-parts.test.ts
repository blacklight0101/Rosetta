import { describe, expect, it } from 'vitest';
import {
  capturablePromptIds,
  captureInput,
} from '../../../../../src/application/lab/capture/capture-rules.js';
import { block, message, taskOf } from '../../../../support/capture-fixtures.js';

// RF-1404, RF-1406, DEC-57: what the capture keeps for the other reader prompts: the parts of the
// first message, the refusal after a short read, the last turn. Never a system prompt or an answer.

const context = { maxTurns: 9 };

const areaText = [
  'area: shop',
  'files: 3',
  'shop/Orders.cs (csharp, 120 lines)',
  'shop/Pay.cs (csharp, 40 lines)',
  'shop/workbook.md (markdown, 9 lines)',
].join('\n');

const entries = ['A', 'B', 'C', 'D', 'E', 'F'].map(
  (letter) => `Question OQ-00${letter} (Area: shop): Which ${letter}?\nOwner's answer: ${letter}.`,
);
const rejected = {
  rejected: ['1', '2', '3', '4', '5'].map((each) => ({ claimId: `BR-00${each}.c1`, text: 'A.' })),
};
const parent = { cards: [{ id: 'ENT-001', type: 'ENT', title: 'Order' }] };

const readBlock = block('read_file', ['10: class Orders {', '11: }'].join('\n'), [
  { path: 'shop/Orders.cs', startLine: 10, endLine: 11 },
]);

const refusal = `You gave your final answer, but you have read only 12% of the code of your area (2488 of 20390
tokens). Your answer is not accepted yet.

${block('list_area_files', 'shop/Pay.cs\nshop/workbook.md')}

Call read_file. Turns left: 10. Keep one turn for the final answer.`;

const first = [
  'Describe the area.',
  block('list_area_files', areaText),
  block('owner_answers', entries.join('\n\n'), [], 1),
  block('cards', JSON.stringify(rejected, null, 2), [], 2),
  block('cards', JSON.stringify(parent, null, 2), [], 0),
].join('\n\n');

const deepenTask = taskOf(
  'reader-007',
  message('system', 'You are a reader.'),
  message('user', first),
  message('assistant', 'SECRET-MODEL-ANSWER'),
  message('tool', readBlock),
  message('user', 'Turns left: 8.'),
  message('assistant', 'SECRET-MODEL-ANSWER {"cards": []}'),
  message('user', refusal),
);

const plainTask = taskOf(
  'reader-008',
  message(
    'user',
    `Describe.\n\n${block('list_area_files', 'area: shop\nfiles: 1\nshop/Pay.cs (csharp, 40 lines)')}`,
  ),
);

const base = {
  area: 'shop',
  files: [
    { path: 'shop/Orders.cs', language: 'csharp', lines: 120 },
    { path: 'shop/Pay.cs', language: 'csharp', lines: 40 },
    { path: 'shop/workbook.md', language: 'markdown', lines: 9 },
  ],
  workbook: true,
};
const reads = [{ path: 'shop/Orders.cs', startLine: 10, lines: ['class Orders {', '}'] }];

describe('the capture rules for the parts of the reader first message', () => {
  it('RF-1404 captures the first four owner answers as the text of their block', () => {
    const captured = captureInput('reader/answers', deepenTask, context);

    expect(captured).toEqual({ ...base, turns: 9, answers: entries.slice(0, 4).join('\n\n') });
  });

  it('RF-1404 captures the first four rejected claims of the cards block that holds them', () => {
    const captured = captureInput('reader/reread', deepenTask, context) as { rejected: string };

    expect(JSON.parse(captured.rejected)).toEqual({ rejected: rejected.rejected.slice(0, 4) });
    expect(captured).toMatchObject({ area: 'shop', turns: 9 });
  });

  it('RF-1404 captures the parent cards from the cards block that lists cards', () => {
    const captured = captureInput('reader/parent-cards', deepenTask, context) as {
      parentCards: string;
    };

    expect(JSON.parse(captured.parentCards)).toEqual(parent);
  });

  it('RF-1404 gives nothing for a task without the part, and never a model answer', () => {
    for (const id of ['reader/answers', 'reader/reread', 'reader/parent-cards']) {
      expect(captureInput(id, plainTask, context)).toBeUndefined();
      expect(JSON.stringify(captureInput(id, deepenTask, context))).not.toContain('SECRET');
    }
  });
});

describe('the capture rules for the turns of the reader', () => {
  it('RF-1404 captures the refusal after a short read: its numbers, its files, the turns left, the reads', () => {
    const captured = captureInput('reader/read-more', deepenTask, context);

    expect(captured).toEqual({
      ...base,
      turns: 11,
      reads,
      readMore: {
        percent: 12,
        readTokens: 2488,
        tokens: 20390,
        unread: ['shop/Pay.cs', 'shop/workbook.md'],
      },
    });
    expect(JSON.stringify(captured)).not.toContain('SECRET');
  });

  it('RF-1404 gives no read-more case without a refusal or without reads', () => {
    expect(captureInput('reader/read-more', plainTask, context)).toBeUndefined();
    const unread = taskOf('reader-009', ...deepenTask.messages.filter((m) => m.role !== 'tool'));
    expect(captureInput('reader/read-more', unread, context)).toBeUndefined();
  });

  it('RF-1404 captures the last turn for the turns-left message, with the reads', () => {
    expect(captureInput('reader/turns-left', deepenTask, context)).toEqual({
      ...base,
      turns: 2,
      reads,
    });
    expect(captureInput('reader/turns-left', plainTask, context)).toBeUndefined();
  });
});

describe('the capture rules for the last turn and the workbook', () => {
  it('RF-1404 captures a workbook case only for an area that holds a workbook', () => {
    expect(captureInput('reader/workbook', deepenTask, context)).toEqual({
      ...base,
      turns: 9,
      reads,
    });
    expect(captureInput('reader/workbook', plainTask, context)).toBeUndefined();
  });

  it('RF-1404 lists the six ids among those it can capture', () => {
    expect(capturablePromptIds).toEqual(
      expect.arrayContaining([
        'reader/answers',
        'reader/parent-cards',
        'reader/read-more',
        'reader/reread',
        'reader/turns-left',
        'reader/workbook',
      ]),
    );
  });
});
