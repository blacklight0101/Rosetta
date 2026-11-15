import { describe, expect, it } from 'vitest';
import { readMoreMessage } from '../../../../src/application/agent/reader-prompts.js';
import { testReaderPrompts } from '../../../support/agent-fixtures.js';
import type { PromptFile } from '../../../../src/application/agent/prompt-file.js';

// P3-78, Q-50: the refusal message of a reader that read little of its area; repository text in the
// file list is data and is never read as a placeholder of the template.

const share = { percent: 3, readTokens: 1094, tokens: 28028, lines: 350 };

describe('readMoreMessage', () => {
  it('RF-206 says how much of the area was read, the files and the turns left', () => {
    const message = readMoreMessage(testReaderPrompts, { ...share, filesBlock: 'BLOCK', turns: 6 });

    expect(message).toContain('BLOCK');
    expect(message).toContain('3%');
    expect(message).toContain('1094');
    expect(message).toContain('28028');
    expect(message).toContain('Turns left: 6.');
  });

  it('RF-206 leaves a file name that holds a placeholder as it was written', () => {
    const message = readMoreMessage(testReaderPrompts, {
      ...share,
      filesBlock: 'src/{{turns}}{{percent}}.cs',
      turns: 6,
    });

    expect(message).toContain('src/{{turns}}{{percent}}.cs');
    expect(message).toContain('Turns left: 6.');
  });

  it('RF-1414 states the line budget of the ask where the template holds {{lines}}', () => {
    const readMore: PromptFile = {
      ...testReaderPrompts.readMore,
      text: 'Read at most {{lines}} lines.\n{{files}}\nTurns left: {{turns}}.',
    };
    const message = readMoreMessage(
      { ...testReaderPrompts, readMore },
      { ...share, filesBlock: 'src/{{lines}}.cs', turns: 6 },
    );

    expect(message).toContain('Read at most 350 lines.');
    expect(message).toContain('src/{{lines}}.cs');
  });
});

describe('readMoreMessage with no line cap', () => {
  it('RF-1414 leaves {{lines}} as written when no cap is set (DEC-246)', () => {
    const readMore: PromptFile = {
      ...testReaderPrompts.readMore,
      text: 'Read at most {{lines}} lines.\n{{files}}\nTurns left: {{turns}}.',
    };
    const message = readMoreMessage(
      { ...testReaderPrompts, readMore },
      { ...share, lines: undefined, filesBlock: 'BLOCK', turns: 6 },
    );

    expect(message).toContain('Read at most {{lines}} lines.');
    expect(message).not.toContain('undefined');
    expect(message).toContain('Turns left: 6.');
  });
});
