import { describe, expect, it } from 'vitest';
import type { ToolCall } from '../../../../src/application/ports/llm-provider.js';
import { summariseTurns, type ToolTurn } from '../../../../src/application/lab/lab-turns.js';
import {
  citedPaths,
  readerFirstTurn,
  toolTurnOf,
  type TurnScope,
} from '../../../../src/application/lab/targets/tool-turn.js';
import { fakeResponse } from '../../../support/fake-recordings.js';

// RF-1410: a reader turn that answers with tool calls is measured by what its calls do, each count
// matched to what a run does with the call (agent-loop.ts, ToolRunner, the read gate).

const files = [
  { path: 'shop/Orders.cs', language: 'csharp', lines: 120 },
  { path: 'shop/Pay.cs', language: 'csharp', lines: 40 },
  { path: 'shop/logo.bin', language: 'unknown', skipped: 'binary' },
];

const scope: TurnScope = { files, earlier: [], aimedAt: null };

let ids = 0;
const call = (name: string, args: unknown): ToolCall => ({
  id: `c${String((ids += 1))}`,
  name,
  arguments: args,
});
const read = (path: string, startLine = 1, endLine = 40) =>
  call('read_file', { path, startLine, endLine });

const answer = (text: string, toolCalls: readonly ToolCall[] = []) =>
  fakeResponse({
    ...{ text, toolCalls: [...toolCalls] },
    usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  });

describe('the counts of a tool turn', () => {
  it('RF-1410 counts area work, unlisted paths, repeats and relists from the calls alone', () => {
    const turn = toolTurnOf(
      [
        read('shop/Orders.cs'),
        read('shop/Orders.cs'),
        read('shop/Missing.cs'),
        read('shop/logo.bin'),
        call('grep', { pattern: 'Total' }),
        call('codemap_query', { symbol: 'Order' }),
        call('codemap_query', { path: 'shop/Pay.cs' }),
        call('codemap_query', { path: 'other/Thing.cs' }),
        call('list_area_files', {}),
      ],
      scope,
    );

    expect(turn).toMatchObject({
      calls: 9,
      areaReads: 4,
      unlisted: 3,
      repeats: 1,
      relists: 1,
      aimed: null,
    });
  });

  it('RF-1410 counts a call that repeats a replayed read as a repeat, compared as the run compares', () => {
    const earlier = [read('shop/Orders.cs', 10, 11)];
    const turn = toolTurnOf([read('shop/Orders.cs', 10, 11), read('shop/Orders.cs', 12, 40)], {
      ...scope,
      earlier,
    });

    expect(turn).toMatchObject({ calls: 2, areaReads: 1, repeats: 1 });
  });

  it('RF-1410 counts the reads aimed at the files a prompt points to, and only there', () => {
    const aimedAt = new Set(['shop/Pay.cs']);
    const turn = toolTurnOf([read('shop/Pay.cs'), read('shop/Orders.cs')], { ...scope, aimedAt });

    expect(turn.aimed).toBe(1);
    expect(toolTurnOf([read('shop/Pay.cs')], scope).aimed).toBeNull();
  });
});

describe('what a tool turn records to be read', () => {
  it('RF-1410 writes one short line per call, at most 40', () => {
    const turn = toolTurnOf(
      [
        read('shop/Orders.cs', 3, 9),
        call('grep', { pattern: 'Total' }),
        call('list_area_files', {}),
      ],
      scope,
    );
    const many = toolTurnOf(
      Array.from({ length: 45 }, (_, at) => read('shop/Orders.cs', at + 1, at + 1)),
      scope,
    );

    expect(turn.seen).toEqual(['read_file shop/Orders.cs:3-9', 'grep Total', 'list_area_files']);
    expect(many.seen).toHaveLength(40);
  });

  it('RF-1410 reads the paths a rejected claim cites from the rejected block, and none from text that is not JSON', () => {
    const rejected = JSON.stringify({
      rejected: [
        { claimId: 'BR-001.c1', citations: ['shop/Pay.cs:3-4', 'shop/Orders.cs:9-9'] },
        { claimId: 'BR-001.c2', citations: ['shop/Pay.cs:7-7'] },
      ],
    });

    expect([...citedPaths(rejected)].sort()).toEqual(['shop/Orders.cs', 'shop/Pay.cs']);
    expect(citedPaths('not json').size).toBe(0);
  });
});

describe('the label of a tool turn', () => {
  it('RF-1410 labels a turn by what its calls do: area work, waste, no area read, bad call, answered, empty', () => {
    const label = (text: string, calls: readonly ToolCall[] = []) =>
      readerFirstTurn(answer(text, calls), scope);

    expect(label('', [read('shop/Orders.cs')])).toMatchObject({
      usable: true,
      detail: 'ReadsFiles',
    });
    expect(label('', [read('shop/Orders.cs'), call('list_area_files', {})])).toMatchObject({
      usable: true,
      detail: 'ReadsWithWaste',
    });
    expect(label('', [call('list_area_files', {}), read('shop/Missing.cs')])).toMatchObject({
      usable: false,
      detail: 'NoAreaRead',
    });
    expect(label('', [read('shop/Orders.cs'), call('read_file', { path: 5 })])).toMatchObject({
      usable: false,
      detail: 'BadToolCall',
    });
    expect(label('{"cards": []}')).toMatchObject({ usable: false, detail: 'Answered' });
    expect(label(' ')).toMatchObject({ usable: false, detail: 'Empty' });
  });

  it('RF-1410 records the turn with every label, so a case that answered still counts as a turn', () => {
    const answered = readerFirstTurn(answer('{"cards": []}'), scope);
    const reads = readerFirstTurn(answer('', [read('shop/Orders.cs')]), scope);

    expect(answered.turn).toMatchObject({ calls: 0, areaReads: 0 });
    expect(reads.turn).toMatchObject({
      calls: 1,
      areaReads: 1,
      seen: ['read_file shop/Orders.cs:1-40'],
    });
  });
});

describe('the summary of the tool turns', () => {
  const turn = (over: Partial<ToolTurn>): ToolTurn => ({
    ...{ calls: 0, areaReads: 0, unlisted: 0, repeats: 0, relists: 0, aimed: null, seen: [] },
    ...over,
  });

  it('RF-1410 gives the counts per turn over the cases that record a turn, and none for a run without', () => {
    const summary = summariseTurns([
      turn({ calls: 4, areaReads: 3, unlisted: 1, aimed: 2 }),
      turn({ calls: 2, areaReads: 1, repeats: 1, relists: 1, aimed: 0 }),
      undefined,
    ]);

    expect(summary).toEqual({
      turns: 2,
      calls: 3,
      areaReads: 2,
      unlisted: 0.5,
      repeats: 0.5,
      relists: 0.5,
      aimed: 1,
    });
    expect(summariseTurns([undefined])).toBeNull();
    expect(summariseTurns([turn({ calls: 1, areaReads: 1 })])?.aimed).toBeNull();
  });
});
