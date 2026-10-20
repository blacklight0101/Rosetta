import { expect } from 'vitest';
import type { AgentRole, LlmRequest } from '../../src/application/ports/llm-provider.js';
import { ProviderCallError } from '../../src/infrastructure/providers/provider-call-error.js';
import { estimateInputTokens } from '../../src/infrastructure/providers/usage-estimate.js';
import { contractRequest } from '../contracts/llm-provider.contract.js';
import { failureOf } from './failure-of.js';

// RF-401, DEC-155: requests of an exact estimated size and the error a refused call rejects with.

/** The contract request with its user message padded so the estimate is exactly `tokens`. */
export function requestOf(tokens: number, overrides: Partial<LlmRequest> = {}): LlmRequest {
  const base = { ...contractRequest(), maxOutputTokens: 512, ...overrides };
  const empty = estimateInputTokens({ ...base, messages: [{ role: 'user', content: '' }] });
  const chars = (tokens - empty) * 4;
  const request = { ...base, messages: [{ role: 'user' as const, content: 'x'.repeat(chars) }] };
  expect(estimateInputTokens(request)).toBe(tokens);
  return request;
}

/** A request with 100 tokens of output reserved, as the cut-prompt cases need room below the context. */
export function smallOutput(tokens: number, role: AgentRole = 'reader'): LlmRequest {
  const request = requestOf(tokens, { maxOutputTokens: 100 });
  return { ...request, context: { ...request.context, role } };
}

export function asRole(request: LlmRequest, role: AgentRole): LlmRequest {
  return { ...request, context: { ...request.context, role } };
}

export async function refusal(promise: Promise<unknown>): Promise<ProviderCallError> {
  const error = await failureOf(promise);
  if (!(error instanceof ProviderCallError)) throw new Error('expected a ProviderCallError');
  return error;
}
