import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseTextAnswer } from '../../../../../src/infrastructure/providers/ollama/text-tool-protocol.js';

// RF-205, ADR-013: reading the fenced blocks of a text-protocol answer takes time linear in its
// size, with a small cost per block, so a long answer full of tiny blocks cannot stall the run.
// The old parser threw and caught one JSON error per empty block: 2.5 MB of them took about 3 s.
// Neither check reads the wall clock against a fixed bound, so a loaded machine cannot fail them:
// the cost per block is counted, and the time of a large input is compared with a small one.

const fence = '```';

describe('fenced blocks at a constant cost each', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A failed JSON parse throws, and a throw per block is what made the old parser slow; a block
  // that cannot hold an object is never handed to JSON.parse.
  it.each([
    ['empty tool_call blocks', `${fence}tool_call\n`, 13],
    ['a fence every five bytes', `${fence}x\n`, 5],
  ])('RF-205 a 2.5 MB answer of %s parses no block as JSON', (_name, unit, bytes) => {
    const content = unit.repeat(2_500_000 / bytes);
    const parse = vi.spyOn(JSON, 'parse');

    parseTextAnswer(content);

    expect(parse).not.toHaveBeenCalled();
  });
});

describe('fenced blocks in linear time', () => {
  // A sixteenfold input takes about 16 times as long when linear and about 256 times when
  // quadratic; the bound of 64 sits four times from each. Small and large runs alternate, so a
  // burst of load slows both, and the floor keeps a sub-millisecond baseline from turning timer
  // noise into a ratio.
  const smallSize = 2_500_000 / 16;
  const largeSize = 2_500_000;
  const floorMs = 5;
  const maxGrowth = 64;

  function timeOf(content: string): number {
    const started = performance.now();
    parseTextAnswer(content);
    return performance.now() - started;
  }

  function growthOf(build: (size: number) => string): number {
    const small = build(smallSize);
    const large = build(largeSize);
    const times = [0, 1, 2].map(() => ({ small: timeOf(small), large: timeOf(large) }));
    const fastest = (pick: (each: { small: number; large: number }) => number): number =>
      Math.max(Math.min(...times.map(pick)), floorMs);
    return fastest((each) => each.large) / fastest((each) => each.small);
  }

  const shapes: readonly (readonly [string, (size: number) => string])[] = [
    ['empty tool_call blocks', (size) => `${fence}tool_call\n`.repeat(size / 13)],
    ['a fence every five bytes', (size) => `${fence}x\n`.repeat(size / 5)],
    [
      'a long run of backticks and a long label',
      (size) => `${'`'.repeat(size / 2)}${fence}${'a'.repeat(size / 2)} \t`,
    ],
  ];

  for (const [name, build] of shapes) {
    it(`RF-205 an answer of ${name} grows linearly with its size`, () => {
      expect(growthOf(build)).toBeLessThan(maxGrowth);
    });
  }
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
