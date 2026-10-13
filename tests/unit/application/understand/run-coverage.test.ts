import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { TaskReads, toolsWithReads } from '../../../../src/application/understand/run-coverage.js';
import { footerOf, tagOf } from '../../../support/data-block-tags.js';
import { toolsSetup } from '../../../support/agent-tools-harness.js';
import { loopSetup, readOrder, toolTurn } from '../../../support/agent-loop-harness.js';

// RF-230, data-model 3.8: the file lines of every answer the reader got count as read: a read, the
// lines of grep matches and the statements of a code map entry; a refused call counts nothing.

const ids = { runId: 'run-1', agentTaskId: 'task-orders', callId: 'run-1#1' };

function recorded(): {
  readonly reads: TaskReads;
  readonly run: (name: string, args: unknown) => Promise<unknown>;
} {
  const { tools } = toolsSetup();
  const reads = new TaskReads();
  const wrapped = toolsWithReads(tools, reads);
  return { reads, run: (name, args) => wrapped.run({ id: 'call-1', name, arguments: args }, ids) };
}

describe('toolsWithReads', () => {
  it('RF-230 keeps the lines of every grep match', async () => {
    const { reads, run } = recorded();

    await run('grep', { pattern: 'public class' });

    expect(reads.all().map((read) => read.path)).toEqual([
      'src/Billing/Invoice.cs',
      'src/Orders/Order.cs',
      'src/Orders/OrderService.cs',
    ]);
    expect(reads.all().every((read) => read.startLine === read.endLine)).toBe(true);
  });

  it('RF-230 keeps the statement lines of a code map entry and nothing for a symbol list', async () => {
    const { reads, run } = recorded();

    await run('codemap_query', { path: 'src/Orders/OrderService.cs' });
    await run('codemap_query', { symbol: 'Order' });

    expect(reads.all()).toEqual([{ path: 'src/Orders/OrderService.cs', startLine: 5, endLine: 5 }]);
  });

  it('RF-230 keeps the lines of a read and nothing of a refused call', async () => {
    const { reads, run } = recorded();

    await run('read_file', { path: 'src/Orders/Order.cs', startLine: 1, endLine: 2 });
    await run('read_file', { path: '../outside.cs', startLine: 1, endLine: 2 });
    await run('no_such_tool', {});

    expect(reads.all()).toEqual([{ path: 'src/Orders/Order.cs', startLine: 1, endLine: 2 }]);
  });
});

describe('runAgentTask through toolsWithReads', () => {
  it('RF-145 a repeated call gets a fresh tag, not the tag of the first answer', async () => {
    const { fake, request } = loopSetup([toolTurn([readOrder]), toolTurn([readOrder])], {
      maxTurns: 2,
    });
    const base = request(fake);

    const result = await runAgentTask({
      ...base,
      tools: toolsWithReads(base.tools, new TaskReads()),
    });

    const answers = result.messages.filter((m) => m.role === 'tool').map((m) => m.content);
    const tags = answers.map((content) => tagOf(content));
    expect(answers).toHaveLength(2);
    expect(answers[1]).toContain('RST-');
    expect(tags.every((tag) => /^[a-z2-7]{24}$/.test(tag))).toBe(true);
    expect(new Set(tags).size).toBe(2);
    expect(answers[1]?.split('\n').at(-1)).toBe(footerOf(tags[1] ?? ''));
  });
});
