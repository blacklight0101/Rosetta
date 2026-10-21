import { describe, expect, it } from 'vitest';
import { agentFiles } from '../../../support/agent-fixtures.js';
import { blockOf, toolsSetup } from '../../../support/agent-tools-harness.js';

// RF-202 (Q-47): read_file gives each line with its number, so a model that cites a range copies
// numbers it can see; the header keeps the range, and the limits count the numbers too.

const orderService = (agentFiles['src/Orders/OrderService.cs'] ?? '').split('\n');
const at = (index: number): string => orderService[index] ?? '';

describe('read_file numbers each line', () => {
  it('RF-202 read_file gives each line with its number and the header keeps the range', async () => {
    const { run } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'src/Orders/OrderService.cs',
      startLine: 3,
      endLine: 5,
    });
    const block = blockOf(outcome.content);

    expect(block.text).toBe([`3: ${at(2)}`, `4: ${at(3)}`, `5: ${at(4)}`].join('\n'));
    expect(block.excerpts).toEqual([
      { path: 'src/Orders/OrderService.cs', startLine: 3, endLine: 5 },
    ]);
    expect(block.header).toContain('"startLine":3');
    expect(block.header).toContain('"endLine":5');
  });

  it('RF-202 a read that starts late numbers from its first line, not from 1', async () => {
    const { run } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: 4,
      endLine: 4,
    });

    expect(blockOf(outcome.content).text).toBe('4: }');
  });

  it('RF-202 the lines that fit in the result limit are counted with their numbers', async () => {
    const { run } = toolsSetup({ maxResultChars: 40 });

    const outcome = await run('read_file', {
      path: 'src/Orders/OrderService.cs',
      startLine: 1,
      endLine: 7,
    });
    const block = blockOf(outcome.content);

    const numbered = block.text.split('\n').filter((line) => /^\d+: /.test(line));
    expect(numbered.join('\n').length).toBeLessThanOrEqual(40);
    expect(block.excerpts[0]?.endLine).toBe(numbered.length);
    expect(block.text).toContain(`Lines ${String(numbered.length + 1)}-7 not shown`);
  });
});
