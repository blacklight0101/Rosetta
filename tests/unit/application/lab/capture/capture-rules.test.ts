import { describe, expect, it } from 'vitest';
import { captureInput } from '../../../../../src/application/lab/capture/capture-rules.js';
import { personalDataIn } from '../../../../../src/application/lab/capture/personal-data.js';
import {
  block,
  gapTask,
  mergeTask,
  message,
  readerTask,
  taskOf,
} from '../../../../support/capture-fixtures.js';

// RF-1404, DEC-57: what the capture keeps of an agent task: its inputs, read back from the first
// user message, never a system prompt or an assistant message.

const context = { maxTurns: 9 };

describe('the capture rules', () => {
  it('RF-1404 captures the items and the plan of a planner gap task', () => {
    expect(captureInput('planner/gap', gapTask, context)).toEqual({
      items: [{ id: 'feature:F-1', kind: 'feature', name: 'Search', detail: 'Finds a customer.' }],
      phases: [{ number: 1, name: 'Base', goal: 'The base exists.' }],
      requirements: [{ title: 'Customer search' }],
      tasks: [{ id: 'T-001', title: 'Migrations' }],
    });
  });

  it('RF-1404 captures the cards and the type of a summariser merge task, and ignores a lone card', () => {
    const captured = captureInput('summariser/merge', mergeTask, context);

    expect(captured).toMatchObject({ type: 'BR', cards: [{ id: 'BR-001' }, { id: 'BR-002' }] });
    const card = { id: 'BR-1', area: 'a', title: 't', summary: 's', claims: [] };
    const lone = taskOf('summariser-br', message('user', block('cards', JSON.stringify([card]))));
    expect(captureInput('summariser/merge', lone, context)).toBeUndefined();
  });
});

describe('the capture rules for the reader', () => {
  it('RF-1404 captures the area of a reader task with the turns of the run and a workbook mark', () => {
    expect(captureInput('reader/task', readerTask, context)).toEqual({
      area: 'shop',
      files: [
        { path: 'shop/Orders.cs', language: 'csharp', lines: 120 },
        { path: 'shop/workbook.md', language: 'markdown', lines: 9 },
        { path: 'shop/logo.bin', language: 'unknown', skipped: 'binary' },
      ],
      workbook: true,
      turns: 9,
    });
  });

  it('RF-1404 adds the lines the reader read for the card format, from the tool result', () => {
    const captured = captureInput('cards/card-format', readerTask, context);

    expect(captured).toMatchObject({
      reads: [
        {
          path: 'shop/Orders.cs',
          startLine: 10,
          lines: ['class Orders {', '  int Total() { return 1; }', '}'],
        },
      ],
    });
  });

  it('RF-1404 never lets a system prompt or a model answer into a case', () => {
    for (const [id, each] of [
      ['planner/gap', gapTask],
      ['summariser/merge', mergeTask],
      ['reader/area', readerTask],
      ['cards/card-format', readerTask],
    ] as const) {
      const text = JSON.stringify(captureInput(id, each, context));
      expect(text).not.toContain('SECRET-MODEL-ANSWER');
      expect(text).not.toContain('You are a reader');
    }
  });

  it('RF-1404 gives nothing for a task that is not an input of the prompt', () => {
    expect(captureInput('planner/gap', mergeTask, context)).toBeUndefined();
    expect(captureInput('summariser/merge', gapTask, context)).toBeUndefined();
    expect(captureInput('reader/task', gapTask, context)).toBeUndefined();
  });
});

describe('the personal data scan', () => {
  it('RF-1404 names an e-mail address, a drive path, a home folder and a key', () => {
    expect(personalDataIn('write to jane.doe@example.com')).toBe('an e-mail address');
    expect(personalDataIn('C:\\work\\app')).toBe('a drive path');
    expect(personalDataIn('/home/jane/app')).toBe('a home folder');
    expect(personalDataIn('key sk-abcdefghijklmnopqrstuvwx')).toBe('a key');
    expect(personalDataIn('shop/Orders.cs: total = a * b')).toBeUndefined();
  });
});
