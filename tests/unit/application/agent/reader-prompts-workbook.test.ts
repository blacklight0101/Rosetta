import { describe, expect, it } from 'vitest';
import {
  promptVersionsOf,
  readerPromptsFor,
  readerSystemPrompt,
  type ReaderPrompts,
} from '../../../../src/application/agent/reader-prompts.js';
import { testReaderPrompts } from '../../../support/agent-fixtures.js';

// RF-155, RNF-004, ADR-004: the workbook guidance reaches the system prompt of a task only when
// its area holds a rendered workbook; every other task gets the very same prompts as before, and
// the run manifest names the guidance only when some task used it.

const file = (name: string, text: string) => ({
  name,
  version: 'v1',
  sha256: 'b'.repeat(64),
  text,
});

const guidance = file('reader/workbook.v1.md', 'WORKBOOK-GUIDANCE');
const plain: ReaderPrompts = testReaderPrompts;
const withGuidance: ReaderPrompts = { ...testReaderPrompts, workbook: guidance };
const none = { flows: false, screens: false };

describe('the prompts of a task over an area with a rendered workbook', () => {
  it('RF-155 the guidance follows the card format of a workbook area', () => {
    const system = readerSystemPrompt(readerPromptsFor(withGuidance, none, true));

    expect(system).toContain('WORKBOOK-GUIDANCE');
    expect(system.startsWith(readerSystemPrompt(plain).trimEnd())).toBe(true);
  });

  it('RF-155 an area that holds no workbook gets exactly the prompts it got before', () => {
    const system = readerSystemPrompt(readerPromptsFor(withGuidance, none, false));

    expect(system).toBe(readerSystemPrompt(plain));
    expect(system).not.toContain('WORKBOOK-GUIDANCE');
  });

  it('RF-155 the guidance comes after the flows and screens fragments', () => {
    const marked: ReaderPrompts = {
      ...withGuidance,
      surface: {
        flows: file('cards/flows.v1.md', 'FLOWS-FRAGMENT'),
        screens: file('cards/screens.v1.md', 'SCREENS-FRAGMENT'),
      },
    };

    const system = readerSystemPrompt(
      readerPromptsFor(marked, { flows: true, screens: true }, true),
    );

    expect(system.indexOf('SCREENS-FRAGMENT')).toBeLessThan(system.indexOf('WORKBOOK-GUIDANCE'));
  });

  it('RF-155 prompts that loaded no guidance are returned as they are', () => {
    expect(readerPromptsFor(plain, none, true)).toBe(plain);
  });
});

describe('the card fragments of a workbook area', () => {
  const surface = {
    flows: file('cards/flows.v1.md', 'FLOWS-FRAGMENT'),
    screens: file('cards/screens.v1.md', 'SCREENS-FRAGMENT'),
  };
  const full: ReaderPrompts = { ...withGuidance, surface };

  it('RF-155 a workbook area gets the FLOW and SCRN formats its guidance asks for, though the code map marks none', () => {
    const system = readerSystemPrompt(readerPromptsFor(full, none, true));

    expect(system).toContain('FLOWS-FRAGMENT');
    expect(system).toContain('SCREENS-FRAGMENT');
    expect(system.indexOf('SCREENS-FRAGMENT')).toBeLessThan(system.indexOf('WORKBOOK-GUIDANCE'));
  });

  it('RF-155 another area of the same run gets no fragment', () => {
    expect(readerSystemPrompt(readerPromptsFor(full, none, false))).toBe(readerSystemPrompt(plain));
  });

  it('RNF-004 the manifest records the fragments a workbook area used with the guidance', () => {
    const names = Object.keys(promptVersionsOf(full, none, true));

    expect(names).toContain('cards/flows.v1.md');
    expect(names).toContain('cards/screens.v1.md');
    expect(names).toContain('reader/workbook.v1.md');
    expect(Object.keys(promptVersionsOf(full, none, false))).not.toContain('cards/flows.v1.md');
  });
});

describe('the prompt versions of a run with workbooks', () => {
  it('RNF-004 records the guidance with its version and hash when a task used it', () => {
    const versions = promptVersionsOf(withGuidance, none, true);

    expect(versions['reader/workbook.v1.md']).toEqual({ version: 'v1', sha256: 'b'.repeat(64) });
  });

  it('RNF-004 records no guidance when no task area held a workbook', () => {
    expect(Object.keys(promptVersionsOf(withGuidance, none, false))).toEqual(
      Object.keys(promptVersionsOf(plain)),
    );
    expect(Object.keys(promptVersionsOf(withGuidance))).not.toContain('reader/workbook.v1.md');
  });
});
