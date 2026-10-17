import { describe, expect, it } from 'vitest';
import { readFirstMessage } from '../../../../src/application/agent/reader-prompts.js';
import { testReaderPrompts } from '../../../support/agent-fixtures.js';

// RF-206: the refusal message holds the unread files; repository text in them is data and is never
// read as a placeholder of the template.

describe('readFirstMessage', () => {
  it('RF-206 fills the files and the turns left', () => {
    const message = readFirstMessage(testReaderPrompts, 'BLOCK', 4);

    expect(message).toContain('BLOCK');
    expect(message).toContain('Turns left: 4.');
  });

  it('RF-206 leaves a file name that holds {{turns}} as it was written', () => {
    const message = readFirstMessage(testReaderPrompts, 'src/{{turns}}.cs', 4);

    expect(message).toContain('src/{{turns}}.cs');
    expect(message).toContain('Turns left: 4.');
  });
});
