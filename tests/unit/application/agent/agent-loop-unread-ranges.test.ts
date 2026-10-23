import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { shippingCards } from '../../../support/agent-fixtures.js';
import { textTurn, ungatedLoopSetup } from '../../../support/agent-loop-harness.js';

// RF-209, EV-04: a coverage pass task over a partly read file is sent the line ranges to read.

describe('a task that starts with unread ranges', () => {
  it('RF-209 its first message names the file and the lines', async () => {
    const plain = ungatedLoopSetup([textTurn(shippingCards)]);
    const ranged = ungatedLoopSetup([textTurn(shippingCards)]);
    const unreadRanges = [
      { path: 'src/Orders/Order.cs', ranges: [{ startLine: 21, endLine: 80 }] },
    ];

    await runAgentTask(plain.request(plain.fake));
    await runAgentTask({ ...ranged.request(ranged.fake), unreadRanges });

    const first = plain.fake.requests[0]?.messages[0]?.content ?? '';
    const text = ranged.fake.requests[0]?.messages[0]?.content ?? '';
    expect(text).not.toBe(first);
    expect(text).toContain('src/Orders/Order.cs:21-80');
    expect(first).not.toContain('src/Orders/Order.cs:21-80');
  });
});
