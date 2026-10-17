import { err, type Result } from '../../domain/errors/result.js';
import type { LlmResponse } from '../ports/llm-provider.js';

// RF-301: reads the verifier's answer (P2-02, not built yet).

export type JudgedStatus = 'Supported' | 'Rejected';

export interface Verdict {
  readonly status: JudgedStatus;
  readonly reason: string;
}

export const MAX_REASON_CHARS = 300;

// RF-301
export function parseVerdictAnswer(
  response: Pick<LlmResponse, 'text' | 'toolCalls' | 'finishReason'>,
): Result<Verdict, string> {
  return err(`not built: ${response.text}`);
}
