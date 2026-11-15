import { describe, expect, it } from 'vitest';
import {
  capturablePromptIds,
  captureInput,
} from '../../../../../src/application/lab/capture/capture-rules.js';
import { block, message, taskOf } from '../../../../support/capture-fixtures.js';

// RF-1404, RF-1406, DEC-57: what the capture keeps for the flows, screens and continue prompts: the
// area and two reads, as for the card format. Which fragments an area had is read from the headings
// of the system prompt; no text of it and no answer of a model is kept.

const context = { maxTurns: 9 };

const area = block(
  'list_area_files',
  ['area: shop', 'files: 1', 'shop/Orders.cs (csharp, 120 lines)'].join('\n'),
);
const read = block('read_file', ['10: class Orders {', '11: }'].join('\n'), [
  { path: 'shop/Orders.cs', startLine: 10, endLine: 11 },
]);

const system = (...fragments: string[]) =>
  message('system', ['Reader.', ...fragments].join('\n\n'));
const FLOWS = '## Flows: journeys that start at an entry point\n\nSECRET-FLOWS-TEXT';
const SCREENS = '## Screens: pages, forms and views\n\nSECRET-SCREENS-TEXT';

function taskWith(name: string, sys: ReturnType<typeof system>, withRead = true) {
  const tool = withRead ? [message('tool', read)] : [];
  return taskOf(
    ...[name, sys, message('user', `Describe.\n\n${area}`)],
    ...[message('assistant', 'SECRET-MODEL-ANSWER'), ...tool],
  );
}

const expected = {
  area: 'shop',
  files: [{ path: 'shop/Orders.cs', language: 'csharp', lines: 120 }],
  turns: 9,
  reads: [{ path: 'shop/Orders.cs', startLine: 10, lines: ['class Orders {', '}'] }],
};

describe('the capture rules for the flows, screens and continue prompts', () => {
  it('RF-1406 lists the three ids among those it can capture', () => {
    expect(capturablePromptIds).toEqual(
      expect.arrayContaining(['cards/continue', 'cards/flows', 'cards/screens']),
    );
  });

  it('RF-1406 captures a flows case only from a task whose system prompt had the flows fragment', () => {
    const capture = (sys: ReturnType<typeof system>) =>
      captureInput('cards/flows', taskWith('reader-001', sys), context);

    expect(capture(system(FLOWS))).toEqual(expected);
    expect(capture(system(SCREENS))).toBeUndefined();
    expect(capture(system())).toBeUndefined();
  });

  it('RF-1406 captures a screens case only from a task whose system prompt had the screens fragment', () => {
    const capture = (sys: ReturnType<typeof system>) =>
      captureInput('cards/screens', taskWith('reader-002', sys), context);

    expect(capture(system(FLOWS, SCREENS))).toEqual(expected);
    expect(capture(system(FLOWS))).toBeUndefined();
  });

  it('RF-1406 captures a continue case from any reader task that read a file', () => {
    const capture = (withRead: boolean) =>
      captureInput('cards/continue', taskWith('reader-003', system(), withRead), context);

    expect(capture(true)).toEqual(expected);
    expect(capture(false)).toBeUndefined();
  });

  it('RF-1406 keeps no prompt text and no answer, and reads reader tasks only', () => {
    const flows = (name: string) =>
      captureInput('cards/flows', taskWith(name, system(FLOWS)), context);

    expect(JSON.stringify(flows('reader-004'))).not.toContain('SECRET');
    expect(flows('planner-gap')).toBeUndefined();
  });
});
