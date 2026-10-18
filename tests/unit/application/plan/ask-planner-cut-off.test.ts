import { describe, expect, it } from 'vitest';
import { askPlannerWith, type PlannerCall } from '../../../../src/application/plan/ask-planner.js';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../../src/application/ports/llm-provider.js';
import { ManifestUpdates } from '../../../../src/application/runs/manifest-updates.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-604, RF-601, RF-007: a planner answer cut off at the output limit is continued, at most twice
// per call, and one that stays cut off is a clear error that names the setting.

const limit = 1000;
const continuePrompt = {
  name: 'planner/continue.v1.md',
  version: 'v1',
  sha256: 'a'.repeat(64),
  text: 'Continue the JSON.\n',
};

interface Piece {
  readonly text: string;
  readonly finishReason?: LlmResponse['finishReason'];
  readonly outputTokens?: number;
}

function responseOf(piece: Piece): LlmResponse {
  const { text, finishReason = 'stop', outputTokens = 50 } = piece;
  const usage = { inputTokens: 10, outputTokens, cachedInputTokens: 0 } as const;
  return fakeResponse({
    ...{ text, toolCalls: [], finishReason },
    usage: { ...usage, usageSource: 'reported' },
  });
}

function setup(pieces: readonly Piece[], onCutOff?: PlannerCall['onCutOff']) {
  const requests: LlmRequest[] = [];
  const provider: LlmProvider = {
    complete(request) {
      requests.push(request);
      const piece = pieces[requests.length - 1];
      if (piece === undefined) throw new Error('more calls than the test planned');
      return Promise.resolve(responseOf(piece));
    },
  };
  let count = 0;
  const run = sampleRun({ stage: 'plan' });
  const call: PlannerCall = {
    run,
    planner: {
      ...{ provider, name: 'fake', kind: 'fake', model: 'm', maxOutputTokens: limit },
      keySource: 'user',
    },
    prompt: { name: 'planner/package.v4.md', version: 'v4', sha256: 'b'.repeat(64), text: 'plan' },
    continuePrompt,
    agentTaskId: 'planner-package',
    updates: new ManifestUpdates(new MemoryRunManifestStore(), scopeFor()),
    tags: () => 'tag',
    callId: () => {
      count += 1;
      return `${run.runKey}#${String(count)}`;
    },
    signal: new AbortController().signal,
    ...(onCutOff === undefined ? {} : { onCutOff }),
  };
  return { call, requests };
}

async function failureOf(promise: Promise<unknown>): Promise<RosettaError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RosettaError) return error;
  }
  throw new Error('expected a RosettaError');
}

describe('askPlannerWith: a cut-off answer is continued', () => {
  it('RF-604 an answer that stops at the limit is continued and joined', async () => {
    const { call, requests } = setup([
      { text: '{"requirements": [{"title": "A", ', finishReason: 'length', outputTokens: limit },
      { text: '"statement": "B"}]}' },
    ]);

    const text = await askPlannerWith(call, 'the message');

    expect(text).toBe('{"requirements": [{"title": "A", "statement": "B"}]}');
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages).toEqual([
      { role: 'user', content: 'the message' },
      { role: 'assistant', content: '{"requirements": [{"title": "A", ' },
      { role: 'user', content: 'Continue the JSON.' },
    ]);
    expect(requests[1]?.context.callId).not.toBe(requests[0]?.context.callId);
    expect(requests[1]?.maxOutputTokens).toBe(limit);
  });

  it('RF-604 a provider with no stop reason is detected by the token count and unclosed JSON', async () => {
    const { call, requests } = setup([
      { text: '{"a": [1, 2,', finishReason: 'stop', outputTokens: limit },
      { text: ' 3]}' },
    ]);

    expect(await askPlannerWith(call, 'm')).toBe('{"a": [1, 2, 3]}');
    expect(requests).toHaveLength(2);
  });
});

describe('askPlannerWith: an answer that is not cut off', () => {
  it('RF-604 an unclosed answer below the limit is not continued', async () => {
    const { call, requests } = setup([{ text: '{"a": [1, 2', outputTokens: limit - 1 }]);

    expect(await askPlannerWith(call, 'm')).toBe('{"a": [1, 2');
    expect(requests).toHaveLength(1);
  });

  it('RF-604 a closed answer that used the whole limit is not continued', async () => {
    const { call, requests } = setup([{ text: '{"a": 1}', outputTokens: limit }]);

    expect(await askPlannerWith(call, 'm')).toBe('{"a": 1}');
    expect(requests).toHaveLength(1);
  });

  it('RF-604 a closed answer reported as length is not continued', async () => {
    const { call, requests } = setup([{ text: '{"a": 1}', finishReason: 'length' }]);

    expect(await askPlannerWith(call, 'm')).toBe('{"a": 1}');
    expect(requests).toHaveLength(1);
  });

  it('RF-604 at most two continuations, then the error names the setting and the count', async () => {
    const cut = { text: '{"a": [', finishReason: 'length', outputTokens: limit } as const;
    const { call, requests } = setup([cut, cut, cut, cut]);

    const error = await failureOf(askPlannerWith(call, 'm'));

    expect(requests).toHaveLength(3);
    expect(error.code).toBe('RST-1805');
    expect(error.message).toContain('1000 output tokens');
    expect(error.message).toContain('Planner max output tokens');
    expect(error.message).not.toContain('{"a"');
  });
});

describe('askPlannerWith: the limit of continuations', () => {
  it('RF-604 a second continuation completes the answer', async () => {
    const { call, requests } = setup([
      { text: '{"a": [1,', finishReason: 'length' },
      { text: ' 2,', finishReason: 'length' },
      { text: ' 3]}' },
    ]);

    expect(await askPlannerWith(call, 'm')).toBe('{"a": [1, 2, 3]}');
    expect(requests[2]?.messages).toHaveLength(3);
    expect(requests[2]?.messages[1]).toEqual({ role: 'assistant', content: '{"a": [1, 2,' });
    expect(requests[1]?.messages).toHaveLength(3);
  });
});

describe('askPlannerWith: what the continuation holds', () => {
  it('RF-604 a continuation that starts the JSON again replaces the cut-off start', async () => {
    const { call } = setup([
      { text: '{"requirements": [{"title": "A", "sta', finishReason: 'length' },
      { text: '{"requirements": [{"title": "A", "statement": "B"}]}' },
    ]);

    expect(await askPlannerWith(call, 'm')).toBe(
      '{"requirements": [{"title": "A", "statement": "B"}]}',
    );
  });

  it('RF-604 a continuation with prose and a fence around the rest is joined as written', async () => {
    const { call } = setup([
      { text: '{"a": [1,', finishReason: 'length' },
      { text: ' 2]}\nThat is all.' },
    ]);

    expect(await askPlannerWith(call, 'm')).toBe('{"a": [1, 2]}\nThat is all.');
  });

  it('RF-604 with a hook, an answer still cut off is returned after the hook names the cause', async () => {
    const messages: string[] = [];
    const cut = { finishReason: 'length', outputTokens: limit } as const;
    const pieces = [
      { text: '{"a": [1,', ...cut },
      { text: ' 2,', ...cut },
      { text: ' 3,', ...cut },
    ];
    const { call, requests } = setup(pieces, (message) => {
      messages.push(message);
      return Promise.resolve();
    });

    expect(await askPlannerWith(call, 'm')).toBe('{"a": [1, 2, 3,');
    expect(requests).toHaveLength(3);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('1000 output tokens');
    expect(messages[0]).toContain('Planner max output tokens');
  });
});

describe('askPlannerWith: a continuation that ends without finishing the JSON (P3-31)', () => {
  it('RF-007 a last continuation that stops normally with JSON still open is RST-1805', async () => {
    const { call, requests } = setup([
      { text: '{"a": [1,', finishReason: 'length', outputTokens: limit },
      { text: ' I am sorry, I cannot go on.' },
    ]);

    const error = await failureOf(askPlannerWith(call, 'm'));

    expect(requests).toHaveLength(2);
    expect(error.code).toBe('RST-1805');
    expect(error.message).not.toContain('sorry');
  });

  it('RF-007 with a hook, that answer is returned after the hook names the cause', async () => {
    const messages: string[] = [];
    const { call } = setup(
      [{ text: '{"a": [1,', finishReason: 'length', outputTokens: limit }, { text: ' 2,' }],
      (message) => {
        messages.push(message);
        return Promise.resolve();
      },
    );

    expect(await askPlannerWith(call, 'm')).toBe('{"a": [1, 2,');
    expect(messages).toHaveLength(1);
  });

  it('RF-604 a continuation that opens with prose inside a key is not joined and the call is RST-1805', async () => {
    const { call } = setup([
      { text: '{"items": [{"ti', finishReason: 'length', outputTokens: limit },
      { text: 'Sure, here is the rest: tle":"two"}]}' },
    ]);

    const error = await failureOf(askPlannerWith(call, 'm'));

    expect(error.code).toBe('RST-1805');
  });
});

describe('askPlannerWith: a cut inside a string is resumed at the boundary before it (P3-31)', () => {
  const cut = { finishReason: 'length', outputTokens: limit } as const;

  it.each([
    ['{"statement": "Make', '"Make sure that the total is: 5."}'],
    ['{"statement": "Pay the bo', '"Pay the book: due today."}'],
    ['{"statement": "dis', '"discontinuing: legacy"}'],
  ])(
    'RF-604 %j is shown to the model without the cut string and joined whole',
    async (head, rest) => {
      const { call, requests } = setup([{ text: head, ...cut }, { text: rest }]);

      const text = await askPlannerWith(call, 'm');

      expect(requests[1]?.messages[1]).toEqual({ role: 'assistant', content: '{"statement": ' });
      expect(text).toBe(`{"statement": ${rest}`);
    },
  );

  it.each(['Sure! der"}', 'Understood. der"}', 'Sure, here is the rest der"}'])(
    'RF-604 a continuation that opens with prose (%j) is RST-1805, never glued in',
    async (prose) => {
      const { call } = setup([{ text: '{"statement": "Pay the or', ...cut }, { text: prose }]);

      const error = await failureOf(askPlannerWith(call, 'm'));

      expect(error.code).toBe('RST-1805');
      expect(error.message).not.toContain('Pay the');
    },
  );
});

describe('askPlannerWith: a single string longer than the limit (P3-31)', () => {
  it('RF-007 a string that never fits is rewritten from its quote each time and ends in RST-1805', async () => {
    const cut = { finishReason: 'length', outputTokens: limit } as const;
    const { call, requests } = setup([
      { text: '{"a": "xxxxxxxx', ...cut },
      { text: '"xxxxxxxxxxxxxxxx', ...cut },
      { text: '"xxxxxxxxxxxxxxxx', ...cut },
    ]);

    const error = await failureOf(askPlannerWith(call, 'm'));

    expect(error.code).toBe('RST-1805');
    expect(requests).toHaveLength(3);
    expect(requests[2]?.messages[1]).toEqual({ role: 'assistant', content: '{"a": ' });
  });
});
