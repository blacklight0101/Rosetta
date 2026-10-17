import { describe, expect, it } from 'vitest';
import {
  promptVersionsOf,
  readerPromptsFor,
  readerSystemPrompt,
  type ReaderPrompts,
} from '../../../../src/application/agent/reader-prompts.js';
import { testReaderPrompts } from '../../../support/agent-fixtures.js';

// Q-25, RF-260, RF-261, RNF-004: the flow and screen fragments reach the system prompt of a task
// only when its area is marked for them, so an area of plain libraries costs nothing extra; the
// run manifest names a fragment only when a task used it.

const file = (name: string, text: string) => ({
  name,
  version: 'v1',
  sha256: 'a'.repeat(64),
  text,
});

const prompts: ReaderPrompts = {
  ...testReaderPrompts,
  surface: {
    flows: file('cards/flows.v1.md', 'FLOWS-FRAGMENT'),
    screens: file('cards/screens.v1.md', 'SCREENS-FRAGMENT'),
  },
};

const marked = (flows: boolean, screens: boolean) => ({ flows, screens });

describe('the prompts of a task over a marked area', () => {
  it('Q-25 an area marked for neither gets exactly the prompts of any reader task', () => {
    const system = readerSystemPrompt(readerPromptsFor(prompts, marked(false, false)));

    expect(system).toBe(readerSystemPrompt(prompts));
    expect(system).not.toContain('FRAGMENT');
  });

  it('RF-260 an area with entry points gets the flows fragment and not the screens one', () => {
    const system = readerSystemPrompt(readerPromptsFor(prompts, marked(true, false)));

    expect(system).toContain('FLOWS-FRAGMENT');
    expect(system).not.toContain('SCREENS-FRAGMENT');
  });

  it('RF-261 an area with pages gets the screens fragment and not the flows one', () => {
    const system = readerSystemPrompt(readerPromptsFor(prompts, marked(false, true)));

    expect(system).toContain('SCREENS-FRAGMENT');
    expect(system).not.toContain('FLOWS-FRAGMENT');
  });

  it('RF-260 the fragments follow the card format, flows first, so the prefix stays stable', () => {
    const system = readerSystemPrompt(readerPromptsFor(prompts, marked(true, true)));

    expect(system.startsWith(readerSystemPrompt(prompts))).toBe(true);
    expect(system.indexOf('FLOWS-FRAGMENT')).toBeLessThan(system.indexOf('SCREENS-FRAGMENT'));
  });

  it('Q-25 prompts without the fragments (a run that loaded none) are returned as they are', () => {
    const plain = readerPromptsFor(testReaderPrompts, marked(true, true));

    expect(readerSystemPrompt(plain)).toBe(readerSystemPrompt(testReaderPrompts));
  });
});

describe('the prompt versions of a run', () => {
  it('RNF-004 records no fragment when no task area is marked', () => {
    expect(Object.keys(promptVersionsOf(prompts, marked(false, false)))).not.toContain(
      'cards/flows.v1.md',
    );
    expect(Object.keys(promptVersionsOf(prompts))).toEqual(
      Object.keys(promptVersionsOf(testReaderPrompts)),
    );
  });

  it('RNF-004 records the fragments the run used, with version and hash', () => {
    const versions = promptVersionsOf(prompts, marked(true, true));

    expect(versions['cards/flows.v1.md']).toEqual({ version: 'v1', sha256: 'a'.repeat(64) });
    expect(versions['cards/screens.v1.md']).toEqual({ version: 'v1', sha256: 'a'.repeat(64) });
  });

  it('RNF-004 records only the fragment that a marked area used', () => {
    const names = Object.keys(promptVersionsOf(prompts, marked(false, true)));

    expect(names).toContain('cards/screens.v1.md');
    expect(names).not.toContain('cards/flows.v1.md');
  });
});
