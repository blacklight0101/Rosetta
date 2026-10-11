import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { FakeProvider } from '../../../../../src/infrastructure/providers/fake/fake-provider.js';
import { ProviderCallError } from '../../../../../src/infrastructure/providers/provider-call-error.js';
import { contractRequest, contractScenarios } from '../../../../contracts/llm-provider.contract.js';
import { recordingOf } from '../../../../support/fake-recordings.js';
import { failureOf } from '../../../../support/failure-of.js';

describe('FakeProvider replays recordings', () => {
  it('RNF-005 refuses kind fake unless ROSETTA_TEST=1', () => {
    const create = (): FakeProvider =>
      new FakeProvider({ testMode: false, recording: recordingOf(contractScenarios.text) });

    expect(create).toThrow(RosettaError);
    expect(create).toThrow(expect.objectContaining({ code: ERROR_CODES.fakeProviderRefused }));
  });

  it('RF-400 replays the recorded calls in order', async () => {
    const provider = new FakeProvider({
      testMode: true,
      recording: recordingOf(contractScenarios['tool-call'], contractScenarios.text),
    });

    const first = await provider.complete(contractRequest());
    const second = await provider.complete(contractRequest());

    expect(first.finishReason).toBe('tool_use');
    expect(second.text).toBe(contractScenarios.text.response?.text);
  });

  it('RF-400 does not use up a recorded call when the signal is already aborted', async () => {
    const provider = new FakeProvider({
      testMode: true,
      recording: recordingOf(contractScenarios.text),
    });
    const controller = new AbortController();
    controller.abort();
    await failureOf(provider.complete(contractRequest(controller.signal)));

    const response = await provider.complete(contractRequest());

    expect(response.text).toBe(contractScenarios.text.response?.text);
  });
});

describe('FakeProvider fails on demand', () => {
  it('RF-400 fails with RST-1503 when the recording has no call left', async () => {
    const provider = new FakeProvider({
      testMode: true,
      recording: recordingOf(contractScenarios.text),
    });
    await provider.complete(contractRequest());

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.recordingExhausted });
  });

  it('RF-406 fails on demand with the recorded code, HTTP status and request id', async () => {
    const provider = new FakeProvider({
      testMode: true,
      recording: recordingOf({
        retried: [],
        failure: { code: ERROR_CODES.providerTimeout, httpStatus: 504, requestId: 'req-9' },
      }),
    });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error).toMatchObject({
      code: ERROR_CODES.providerTimeout,
      httpStatus: 504,
      requestId: 'req-9',
    });
  });
});
