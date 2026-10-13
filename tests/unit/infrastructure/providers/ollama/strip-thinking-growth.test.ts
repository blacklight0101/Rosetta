import { describe, expect, it } from 'vitest';
import { stripThinking } from '../../../../../src/infrastructure/providers/ollama/text-tool-protocol.js';

// RF-205: stripping thinking text takes time linear in the size of the content.

describe('thinking text in linear time', () => {
  // The old regex was quadratic: its time grew with the square of the size. Comparing two sizes
  // checks the growth and not the speed of the machine, so a loaded runner does not flake. A
  // sixteenfold input takes about 16 times as long when linear and about 256 times when quadratic;
  // the bound of 64 sits four times from each, and the floor keeps a sub-millisecond baseline from
  // turning timer noise into a ratio.
  const smallSize = 50_000;
  const largeSize = 800_000;
  const floorMs = 5;
  const maxGrowth = 64;

  function bestOfThree(content: string): number {
    const times = [0, 1, 2].map(() => {
      const started = performance.now();
      stripThinking(content);
      return performance.now() - started;
    });
    return Math.max(Math.min(...times), floorMs);
  }

  const shapes: readonly (readonly [string, (size: number) => string])[] = [
    ['opening tags', (size) => `Answer.<think>${'<think>'.repeat(size / 7)}`],
    ['opening tags with text', (size) => `<think>${'<think>plan '.repeat(size / 12)}`],
    ['closing tags', (size) => `Answer.${'</think>'.repeat(size / 8)}`],
  ];

  for (const [name, build] of shapes) {
    it(`RF-205 a long unclosed think made of ${name} grows linearly with its size`, () => {
      const small = bestOfThree(build(smallSize));
      const large = bestOfThree(build(largeSize));

      expect(large).toBeLessThan(small * maxGrowth);
    });
  }

  it('RF-205 a long unclosed think is stripped to the text before it', () => {
    expect(stripThinking(`Answer.<think>${'<think>'.repeat(10_000)}`)).toBe('Answer.');
    expect(stripThinking(`<think>${'<think>plan '.repeat(10_000)}`)).toBe('');
  });
});
