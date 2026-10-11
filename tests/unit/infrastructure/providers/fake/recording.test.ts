import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { parseRecording } from '../../../../../src/infrastructure/providers/fake/recording.js';
import { contractScenarios } from '../../../../contracts/llm-provider.contract.js';
import { recordingOf } from '../../../../support/fake-recordings.js';

function refusal(input: unknown): unknown {
  try {
    parseRecording(input, 'fixture.json');
  } catch (error) {
    return error;
  }
  throw new Error('the recording was expected to be refused');
}

describe('parseRecording', () => {
  it('RF-400 accepts a recording of answers, tool calls and failures', () => {
    const recording = recordingOf(
      contractScenarios.text,
      contractScenarios['tool-call'],
      contractScenarios['retry-then-text'],
      contractScenarios['permanent-failure'],
    );

    expect(parseRecording(JSON.parse(JSON.stringify(recording)), 'fixture.json')).toEqual(
      recording,
    );
  });

  it.each([
    ['a missing schemaVersion', { calls: [] }],
    ['a newer schemaVersion', { schemaVersion: 2, description: 'x', calls: [] }],
    ['a call without attempts', { schemaVersion: 1, description: 'x', calls: [{ attempts: [] }] }],
    [
      'an unknown error code',
      { schemaVersion: 1, description: 'x', calls: [{ attempts: [{ failure: { code: 'X' } }] }] },
    ],
    [
      'an answer before the last attempt',
      {
        schemaVersion: 1,
        description: 'x',
        calls: [{ attempts: [{ response: {} }, { failure: { code: 'RST-1504' } }] }],
      },
    ],
    ['an unknown key', { schemaVersion: 1, description: 'x', calls: [], extra: true }],
  ])('RF-400 refuses %s with RST-1502 naming the file', (_name, input) => {
    const error = refusal(input);

    expect(error).toMatchObject({ code: ERROR_CODES.recordingInvalid });
    expect(String(error)).toContain('fixture.json');
  });
});
