import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { agentFiles } from '../../../support/agent-fixtures.js';
import { blockOf, toolsSetup } from '../../../support/agent-tools-harness.js';

// RF-144, RF-201: a read_file request beyond scan.excerptMaxLines is cut to the limit and the
// answer names the lines left out, so the agent can ask for them in another call.

const orderLines = (agentFiles['src/Orders/Order.cs'] ?? '')
  .split('\n')
  .map((line, index) => `${String(index + 1)}: ${line}`);
const orderOf = (start: number, end: number) => ({
  path: 'src/Orders/Order.cs',
  startLine: start,
  endLine: end,
});

describe('read_file over the maximum number of lines', () => {
  it('RF-144 a read beyond the configured maximum is cut to the maximum and names the lines left out', async () => {
    const { run } = toolsSetup({ maxReadLines: 2 });

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: 1,
      endLine: 4,
    });
    const block = blockOf(outcome.content);

    expect(outcome.error).toBeUndefined();
    expect(block.excerpts).toEqual([orderOf(1, 2)]);
    expect(block.text).toBe(
      `${orderLines.slice(0, 2).join('\n')}\nLines 3-4 not shown; ask for them in another read_file call.`,
    );
  });

  it('RF-144 a range exactly at the maximum is served whole, with no notice', async () => {
    const { run } = toolsSetup({ maxReadLines: 2 });

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: 2,
      endLine: 3,
    });
    const block = blockOf(outcome.content);

    expect(block.excerpts).toEqual([orderOf(2, 3)]);
    expect(block.text).toBe(orderLines.slice(1, 3).join('\n'));
  });
});

describe('read_file range edges', () => {
  it('RF-144 a range one line over the maximum is cut and names that last line', async () => {
    const { run } = toolsSetup({ maxReadLines: 2 });

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: 1,
      endLine: 3,
    });
    const block = blockOf(outcome.content);

    expect(block.excerpts).toEqual([orderOf(1, 2)]);
    expect(block.text).toContain('Lines 3-3 not shown; ask for them in another read_file call.');
  });

  it('RF-144 a file shorter than the maximum is served to its last line, with no notice', async () => {
    const { run } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: 1,
      endLine: 99,
    });
    const block = blockOf(outcome.content);

    expect(block.excerpts).toEqual([orderOf(1, 4)]);
    expect(block.text).toBe(orderLines.join('\n'));
  });
});

describe('read_file starts and result size', () => {
  it('RF-144 a start beyond the last line is refused with a line range error', async () => {
    const { run } = toolsSetup();

    const outcome = await run('read_file', {
      path: 'src/Orders/Order.cs',
      startLine: 5,
      endLine: 9,
    });

    expect(outcome.error?.code).toBe(ERROR_CODES.lineRangeInvalid);
    expect(blockOf(outcome.content).excerpts).toEqual([]);
  });

  it('RF-144 a result cut for its size names the lines left out', async () => {
    const { run } = toolsSetup({ maxResultChars: 70 });

    const outcome = await run('read_file', {
      path: 'src/Orders/OrderService.cs',
      startLine: 1,
      endLine: 7,
    });

    expect(blockOf(outcome.content).text).toContain('Lines 4-7 not shown;');
  });
});
