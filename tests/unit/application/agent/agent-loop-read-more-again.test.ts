import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import type { AgentToolSet } from '../../../../src/application/agent/agent-tool-set.js';
import type { Citation } from '../../../../src/domain/cards/citation.js';
import { readShare } from '../../../../src/domain/cards/read-share.js';
import type { FileEntry } from '../../../../src/domain/code-map/file-entry.js';
import { shippingCards } from '../../../support/agent-fixtures.js';
import { loopSetup, textTurn, toolTurn, type Call } from '../../../support/agent-loop-harness.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-210, RF-230, RF-231, P8-92: a reader that answers after reading less than half of its area is
// asked to read more again, up to three times, while its reads grow between the asks.

const pathArguments = z.object({ path: z.string() });

function pathOf(args: unknown): string {
  const parsed = pathArguments.safeParse(args);
  return parsed.success ? parsed.data.path : '';
}

function toolsOver(files: readonly FileEntry[], reads: Citation[] = []): AgentToolSet {
  return {
    definitions: [],
    areaOverview: () => 'overview',
    readableAreaFiles: () => files.map((file) => file.path),
    readableAreaEntries: () => files,
    renderBlock: (_source, text) => text,
    rowSpans: () => Promise.resolve(undefined),
    run(call) {
      const path = pathOf(call.arguments);
      const file = files.find((each) => each.path === path);
      const excerpts = file === undefined ? [] : [{ path, startLine: 1, endLine: file.lines }];
      reads.push(...excerpts);
      return Promise.resolve({ content: `read ${path}`, excerpts });
    },
  };
}

const read = (path: string): Call => ({ name: 'read_file', args: { path } });

function over(files: readonly FileEntry[], outcomes: Parameters<typeof loopSetup>[0], max = 8) {
  const setup = loopSetup(outcomes, { maxTurns: max });
  const tools = toolsOver(files);
  return { ...setup, run: () => runAgentTask({ ...setup.request(setup.fake), tools }) };
}

describe('P8-92 a reader that read some and answers again with unread files left', () => {
  const tenFiles = Array.from({ length: 10 }, (_, at) => entry(`src/F${String(at)}.cs`, 10));
  const readAt = (at: number) => toolTurn([read(`src/F${String(at)}.cs`)]);

  it('RF-210 is asked again when its reads since the last ask grew but half the area is still unread', async () => {
    const t = over(tenFiles, [
      readAt(0),
      textTurn(shippingCards),
      readAt(1),
      textTurn(shippingCards),
      toolTurn([read('src/F2.cs'), read('src/F3.cs'), read('src/F4.cs')]),
      textTurn(shippingCards),
    ]);

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(6);
    expect(t.fake.requests[2]?.messages.at(-1)?.content).toContain('10%');
    expect(t.fake.requests[4]?.messages.at(-1)?.content).toContain('20%');
    expect(t.fake.requests).toHaveLength(6);
  });

  it('RF-210 accepts the answer that follows an ask with no new read', async () => {
    const t = over(tenFiles, [
      readAt(0),
      textTurn(shippingCards),
      readAt(1),
      textTurn(shippingCards),
      textTurn(shippingCards),
    ]);

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(5);
    expect(t.fake.requests).toHaveLength(5);
    const asks = result.messages.filter((m) => m.role === 'user' && /\d+%/u.test(m.content));
    expect(asks).toHaveLength(2);
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Free shipping over 50']);
  });
});

describe('P8-92 the limits of the ask', () => {
  const tenFiles = Array.from({ length: 10 }, (_, at) => entry(`src/F${String(at)}.cs`, 10));
  const readAt = (at: number) => toolTurn([read(`src/F${String(at)}.cs`)]);

  it('RF-210 asks at most three times, then accepts the answer', async () => {
    const t = over(
      tenFiles,
      [
        readAt(0),
        textTurn(shippingCards),
        readAt(1),
        textTurn(shippingCards),
        readAt(2),
        textTurn(shippingCards),
        readAt(3),
        textTurn(shippingCards),
      ],
      12,
    );

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(8);
    expect(t.fake.requests).toHaveLength(8);
    expect(t.fake.requests[6]?.messages.at(-1)?.content).toContain('30%');
  });

  it('RF-210 stops asking when too few turns are left to read and answer again', async () => {
    const t = over(
      tenFiles,
      [readAt(0), textTurn(shippingCards), readAt(1), textTurn(shippingCards)],
      4,
    );

    const result = await t.run();

    expect(result.turns).toBe(4);
  });
});

describe('P8-92 a small app whose reader first answers below the bar', () => {
  const app = [
    entry('src/Orders/OrderService.cs', 400),
    entry('src/Orders/Pricing.cs', 300),
    entry('src/Orders/Stock.cs', 200),
    entry('src/Orders/Util.cs', 100),
  ];

  it('RF-210 RF-230 is asked again and the area ends at or above 50% of its first-party tokens', async () => {
    const reads: Citation[] = [];
    const setup = loopSetup(
      [
        toolTurn([read('src/Orders/Util.cs')]),
        textTurn(shippingCards),
        toolTurn([read('src/Orders/OrderService.cs'), read('src/Orders/Stock.cs')]),
        textTurn(shippingCards),
      ],
      { maxTurns: 8 },
    );

    const result = await runAgentTask({
      ...setup.request(setup.fake),
      tools: toolsOver(app, reads),
    });

    expect(readShare(app, reads.slice(0, 1)).share).toBeLessThan(0.5);
    expect(setup.fake.requests[2]?.messages.at(-1)?.content).toContain('10%');
    expect(readShare(app, reads).share).toBeGreaterThanOrEqual(0.5);
    expect(result.state).toBe('Done');
    expect(setup.fake.requests).toHaveLength(4);
  });
});
