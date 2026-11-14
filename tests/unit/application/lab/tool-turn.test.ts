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

// RF-1410: a reader turn that answers with tool calls is graded by what its calls give the run's
// read gate: new lines of readable files, not the number of valid calls.

const files = [
  { path: 'shop/Orders.cs', language: 'csharp', lines: 120 },
  { path: 'shop/Pay.cs', language: 'csharp', lines: 40 },
  { path: 'shop/packages.config', language: 'xml', lines: 40 },
  { path: 'shop/logo.bin', language: 'unknown', skipped: 'binary' },
];

const scope: TurnScope = { files, earlier: [], aim: null, shareBefore: null };

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

const label = (calls: readonly ToolCall[], over: Partial<TurnScope> = {}) =>
  readerFirstTurn(answer('', calls), { ...scope, ...over });

describe('the counts of a tool turn', () => {
  it('RF-1410 counts reads, searches, stale reads, unlisted paths, repeats and relists', () => {
    const turn = toolTurnOf(
      [
        read('shop/Orders.cs'),
        read('shop/Orders.cs'),
        read('shop/Orders.cs', 2, 41),
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
      ...{ calls: 10, areaReads: 1, searches: 3, stale: 1, unlisted: 3, repeats: 1, relists: 1 },
      ...{ newLines: 41, generatedLines: 0, shareBefore: null, aimed: null },
    });
    expect(turn.shareGain).toBeCloseTo(41 / 200);
  });

  it('RF-1410 counts a read of a replayed range moved by one line as stale, with one new line', () => {
    const earlier = [read('shop/Orders.cs', 10, 49)];
    const turn = toolTurnOf([read('shop/Orders.cs', 11, 50)], { ...scope, earlier });

    expect(turn).toMatchObject({ areaReads: 0, stale: 1, newLines: 1, repeats: 0 });
  });

  it('RF-1410 matches a path in another letter case as the code map does', () => {
    expect(toolTurnOf([read('Shop/orders.CS')], scope)).toMatchObject({
      areaReads: 1,
      unlisted: 0,
    });
  });
});

describe('the share and the aim of a tool turn', () => {
  it('RF-1410 adds the share a read-more turn reaches to the share the refusal states', () => {
    const turn = toolTurnOf([read('shop/Orders.cs', 1, 100)], { ...scope, shareBefore: 0.12 });

    expect(turn.shareBefore).toBe(0.12);
    expect(turn.shareGain).toBeCloseTo(100 / 200);
  });

  it('RF-1410 counts the reads aimed at the files a prompt points to, and only there', () => {
    const aim = { kind: 'unread' as const, paths: new Set(['shop/Pay.cs']) };

    expect(toolTurnOf([read('shop/Pay.cs'), read('shop/Orders.cs')], { ...scope, aim }).aimed).toBe(
      1,
    );
    expect(toolTurnOf([read('shop/Pay.cs')], scope).aimed).toBeNull();
  });
});

describe('the weak turns the label fails', () => {
  it('RF-1410 fails a read-more turn that only re-reads a replayed range moved by one line', () => {
    const earlier = [read('shop/Orders.cs', 10, 49)];

    expect(label([read('shop/Orders.cs', 11, 50)], { earlier, shareBefore: 0.25 })).toMatchObject({
      usable: false,
      detail: 'NoAreaRead',
    });
  });

  it('RF-1410 fails a first turn that only queries the code map or greps', () => {
    expect(label([call('codemap_query', { symbol: 'Order' })])).toMatchObject({
      usable: false,
      detail: 'NoAreaRead',
    });
    expect(label([call('grep', { pattern: 'NoSuchThing' })])).toMatchObject({
      usable: false,
      detail: 'NoAreaRead',
    });
  });

  it('RF-1410 fails a turn that reads only a descriptor file while the area has code', () => {
    const turn = label([read('shop/packages.config', 1, 1)]);
    const descriptorsOnly = [{ path: 'shop/packages.config', language: 'xml', lines: 40 }];

    expect(turn).toMatchObject({ usable: false, detail: 'GeneratedOnly' });
    expect(turn.turn).toMatchObject({ newLines: 1, generatedLines: 1 });
    expect(label([read('shop/packages.config')], { files: descriptorsOnly }).detail).toBe(
      'ReadsFiles',
    );
  });

  it('RF-1410 fails a reread turn that reads no file a rejected claim cites', () => {
    const aim = { kind: 'cited' as const, paths: new Set(['shop/Pay.cs']) };

    expect(label([read('shop/Orders.cs')], { aim })).toMatchObject({
      usable: false,
      detail: 'MissesCited',
    });
    expect(label([read('shop/Pay.cs')], { aim }).detail).toBe('ReadsFiles');
  });
});

describe('the other labels of a tool turn', () => {
  it('RF-1410 labels area work, waste, a bad call, an answer and an empty turn', () => {
    expect(label([read('shop/Orders.cs')])).toMatchObject({ usable: true, detail: 'ReadsFiles' });
    expect(label([read('shop/Orders.cs'), call('list_area_files', {})])).toMatchObject({
      usable: true,
      detail: 'ReadsWithWaste',
    });
    expect(label([read('shop/Orders.cs'), call('read_file', { path: 5 })])).toMatchObject({
      usable: false,
      detail: 'BadToolCall',
    });
    expect(readerFirstTurn(answer('{"cards": []}'), scope)).toMatchObject({
      usable: false,
      detail: 'Answered',
    });
    expect(readerFirstTurn(answer(' '), scope)).toMatchObject({ usable: false, detail: 'Empty' });
  });

  it('RF-1410 writes one short line per call, at most 40, and reads cited paths from the block', () => {
    const turn = toolTurnOf(
      [read('shop/Orders.cs', 3, 9), call('grep', { pattern: 'Total' })],
      scope,
    );
    const many = toolTurnOf(
      Array.from({ length: 45 }, (_, at) => read('shop/Orders.cs', at + 1, at + 1)),
      scope,
    );
    const rejected = JSON.stringify({
      rejected: [{ claimId: 'BR-001.c1', citations: ['shop/Pay.cs:3-4', 'shop/Orders.cs:9-9'] }],
    });

    expect(turn.seen).toEqual(['read_file shop/Orders.cs:3-9', 'grep Total']);
    expect(many.seen).toHaveLength(40);
    expect([...citedPaths(rejected)].sort()).toEqual(['shop/Orders.cs', 'shop/Pay.cs']);
    expect(citedPaths('not json').size).toBe(0);
  });
});

describe('the summary of the tool turns', () => {
  const turn = (over: Partial<ToolTurn>): ToolTurn => ({
    ...{ calls: 0, areaReads: 0, searches: 0, unlisted: 0, repeats: 0, relists: 0, stale: 0 },
    ...{ newLines: 0, generatedLines: 0, shareBefore: null, shareGain: 0, aimed: null, seen: [] },
    ...over,
  });

  it('RF-1410 gives the counts per turn, the generated share and the turns that reach half', () => {
    const summary = summariseTurns([
      turn({ calls: 4, areaReads: 3, newLines: 90, generatedLines: 30, aimed: 2 }),
      turn({ calls: 2, areaReads: 1, stale: 1, newLines: 30, shareBefore: 0.3, shareGain: 0.3 }),
      turn({ calls: 1, searches: 1, shareBefore: 0.2, shareGain: 0.1 }),
      undefined,
    ]);

    expect(summary).toMatchObject({
      ...{ turns: 3, calls: 7 / 3, areaReads: 4 / 3, searches: 1 / 3, stale: 1 / 3 },
      ...{ newLines: 40, generatedShare: 0.25, aimed: 2, reachedHalf: 1, shareTurns: 2 },
    });
    expect(summary?.shareGain).toBeCloseTo(0.4 / 3);
    expect(summariseTurns([undefined])).toBeNull();
    expect(summariseTurns([turn({ calls: 1 })])).toMatchObject({
      generatedShare: null,
      aimed: null,
      reachedHalf: null,
    });
  });
});
