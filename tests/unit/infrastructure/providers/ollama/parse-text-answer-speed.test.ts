import { describe, expect, it } from 'vitest';
import { parseTextAnswer } from '../../../../../src/infrastructure/providers/ollama/text-tool-protocol.js';

// RF-205, ADR-013: reading the fenced blocks of a text-protocol answer takes time linear in its
// size, with a small cost per block, so a long answer full of tiny blocks cannot stall the run.
// The old parser threw and caught one JSON error per empty block: 2.5 MB of them took about 3 s.
// The fastest of three runs keeps a busy machine from turning noise into a failure.

const fence = '```';
const maxMs = 100;
/**
 * A fence every five bytes is the densest answer there is: half a million fences take about 30 ms
 * without coverage and up to three times that with it, so this one bound leaves room for both.
 */
const densestMaxMs = 250;

function fastestOfThree(content: string): number {
  const times = [0, 1, 2].map(() => {
    const started = performance.now();
    parseTextAnswer(content);
    return performance.now() - started;
  });
  return Math.min(...times);
}

describe('fenced blocks in linear time', () => {
  it('RF-205 a 2.5 MB answer of empty tool_call blocks parses in under 100 ms', () => {
    const content = `${fence}tool_call\n`.repeat(2_500_000 / 13);

    expect(fastestOfThree(content)).toBeLessThan(maxMs);
  });

  it('RF-205 a 2.5 MB answer of a fence every five bytes parses in under 250 ms', () => {
    const content = `${fence}x\n`.repeat(2_500_000 / 5);

    expect(fastestOfThree(content)).toBeLessThan(densestMaxMs);
  });

  it('RF-205 a long run of backticks and a long label parse in under 100 ms', () => {
    const content = `${'`'.repeat(1_000_000)}${fence}${'a'.repeat(1_000_000)} \t`;

    expect(fastestOfThree(content)).toBeLessThan(maxMs);
  });
});

describe('fenced blocks keep their meaning', () => {
  const call = '{"name": "grep", "arguments": {"pattern": "x"}}';

  it('RF-205 a block ends at the next fence, even a fence that looks like an opener', () => {
    const content = `Before.\n${fence}json\nnot a call\n${fence}tool_call\n${call}\n${fence}`;

    expect(parseTextAnswer(content)).toEqual({ text: content, calls: [] });
  });

  it('RF-205 a fence without a line break after its label is not an opener', () => {
    const content = `${fence}tool_call ${call}\n${fence}tool_call\n${call}\n${fence}`;

    expect(parseTextAnswer(content)).toEqual({
      text: `${fence}tool_call ${call}`,
      calls: [{ name: 'grep', arguments: { pattern: 'x' } }],
    });
  });

  it('RF-205 a fence of four backticks opens a block one backtick later', () => {
    const content = `\`${fence}tool_call\r\n${call}\n${fence}`;

    expect(parseTextAnswer(content)).toEqual({
      text: '`',
      calls: [{ name: 'grep', arguments: { pattern: 'x' } }],
    });
  });

  it('RF-205 several blocks are read in order and the text between them is kept', () => {
    const block = `${fence}tool_call \t\n${call}\n${fence}`;
    const content = `One.\n${block}\nTwo.\n${block}\n${fence}\nplain\n${fence}\nThree.`;

    expect(parseTextAnswer(content)).toEqual({
      text: `One.\n\nTwo.\n\n${fence}\nplain\n${fence}\nThree.`,
      calls: [
        { name: 'grep', arguments: { pattern: 'x' } },
        { name: 'grep', arguments: { pattern: 'x' } },
      ],
    });
  });
});
