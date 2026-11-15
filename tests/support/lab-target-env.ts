import type { PromptFile } from '../../src/application/agent/prompt-file.js';
import type { TargetEnv } from '../../src/application/lab/lab-target.js';
import type {
  LlmRequest,
  LlmResponse,
  ToolCall,
} from '../../src/application/ports/llm-provider.js';
import { fakeResponse } from './fake-recordings.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-1401, RF-1406: an environment for a lab target whose provider answers from a script and keeps
// the requests, and a prompt file to put under test.

export interface Answer {
  readonly text: string;
  readonly toolCalls?: readonly ToolCall[];
}

function responseOf(answer: Answer): LlmResponse {
  return fakeResponse({
    ...{ text: answer.text, toolCalls: answer.toolCalls ?? [] },
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  });
}

export function environment(answers: readonly Answer[]): {
  env: TargetEnv;
  requests: LlmRequest[];
} {
  const requests: LlmRequest[] = [];
  let next = 0;
  const provider = {
    complete: (request: LlmRequest) => {
      requests.push(request);
      const answer = answers[next] ?? { text: '' };
      next += 1;
      return Promise.resolve(responseOf(answer));
    },
  };
  let calls = 0;
  const env: TargetEnv = {
    role: { provider, model: 'fake-model', maxOutputTokens: 400 },
    ids: new SequenceIdGenerator(),
    signal: new AbortController().signal,
    traceId: 'a'.repeat(32),
    caseKey: 'case-1',
    nextCallId: () => `lab#${String((calls += 1))}`,
  };
  return { env, requests };
}

export const draftFile = (name: string, text: string): PromptFile => ({
  name,
  version: 'v9',
  sha256: '0'.repeat(64),
  text,
});
