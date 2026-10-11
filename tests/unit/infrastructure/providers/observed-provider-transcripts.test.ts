import { describe, expect, it } from 'vitest';
import type { LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { contractRequest, contractScenarios } from '../../../contracts/llm-provider.contract.js';
import { FailingMasker } from '../../../support/failing-masker.js';
import { recordingOf } from '../../../support/fake-recordings.js';
import { failureOf } from '../../../support/failure-of.js';
import { observedHarness, observedInstant, textAnswer } from '../../../support/observed-harness.js';
import { secretCases } from '../../../support/secret-fixture.js';

/** The second turn of the task: the first answer's tool call and its result. */
function secondTurn(): LlmRequest {
  const request = contractRequest();
  return {
    ...request,
    context: { ...request.context, callId: '20261011-090503-understand#2' },
    messages: [
      ...request.messages,
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: 'read_file', arguments: {} }],
      },
      { role: 'tool', toolCallId: 'c1', content: 'line 1' },
    ],
  };
}

describe('ObservedProvider transcripts', () => {
  it('RF-408 writes the system prompt, the messages and the answer to the task transcript', async () => {
    const { provider, log } = observedHarness();

    await provider.complete(contractRequest());

    expect(log.transcriptLines('task-1')).toEqual([
      expect.objectContaining({ seq: 1, role: 'system', content: contractRequest().system }),
      expect.objectContaining({ seq: 2, role: 'user', content: 'Describe the Catalog area.' }),
      expect.objectContaining({
        seq: 3,
        role: 'assistant',
        content: textAnswer.text,
        callId: '20261011-090503-understand#1',
        at: observedInstant,
      }),
    ]);
  });

  it('RF-408 adds only the new messages of the next turn and links the record to them', async () => {
    const { provider, log } = observedHarness({
      recording: recordingOf(contractScenarios['tool-call'], contractScenarios.text),
    });
    await provider.complete(contractRequest());

    await provider.complete(secondTurn());

    const roles = ['system', 'user', 'assistant', 'tool', 'assistant'];
    expect(log.transcriptLines('task-1')).toEqual(
      roles.map((role): unknown => expect.objectContaining({ role })),
    );
    expect(log.records()[1]).toMatchObject({ transcriptRef: 'transcripts/task-1.jsonl#4' });
  });

  it('RF-408 writes no transcript and no link when transcripts are off', async () => {
    const { provider, log } = observedHarness({ transcripts: false });

    await provider.complete(contractRequest());

    expect(log.transcriptLines('task-1')).toEqual([]);
    expect(log.records()[0]).not.toHaveProperty('transcriptRef');
  });
});

describe('ObservedProvider masking', () => {
  it('RF-141 fails closed: when masking fails the call is not sent', async () => {
    let sent = false;
    const { provider } = observedHarness({
      masker: new FailingMasker(),
      inner: () => ({
        complete: () => {
          sent = true;
          return Promise.resolve(textAnswer);
        },
      }),
    });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.secretMaskingFailed });
    expect(sent).toBe(false);
  });

  it('RNF-003 no record or transcript line holds a fixture secret', async () => {
    const { provider, log } = observedHarness({
      recording: recordingOf(...secretCases.map(() => contractScenarios.text)),
    });
    for (const [index, { text }] of secretCases.entries()) {
      await provider.complete({
        ...contractRequest(),
        model: text,
        system: text,
        messages: Array.from({ length: index * 2 + 1 }, () => ({
          role: 'user' as const,
          content: text,
        })),
      });
    }

    const written = log.callsText() + log.transcriptText('task-1');
    expect(written).toContain('[MASKED:');
    for (const secret of secretCases.flatMap((secretCase) => secretCase.secrets)) {
      expect(written).not.toContain(secret);
    }
  });
});
