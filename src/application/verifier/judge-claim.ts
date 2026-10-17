import type { Claim } from '../../domain/cards/card.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LlmResponse } from '../ports/llm-provider.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { EvidenceLimits } from './cited-lines.js';
import type { JudgedStatus } from './verdict-answer.js';
import type { VerifierPrompts } from './verifier-prompts.js';

// RF-301: step 2 of the verifier for one claim (P2-02, not built yet).

export type Judgement =
  | {
      readonly kind: 'judged';
      readonly status: JudgedStatus | 'Unverified';
      readonly reason: string;
    }
  | { readonly kind: 'stopped' };

interface JudgementCall {
  readonly runId: string;
  readonly traceId: string;
  readonly nextCallId: () => string;
  readonly signal: AbortSignal;
}

export interface ClaimJudgeParts {
  readonly role: Pick<RoleProvider, 'provider' | 'model' | 'maxOutputTokens' | 'temperature'>;
  readonly prompts: VerifierPrompts;
  readonly reader: Pick<RepositoryReader, 'readLines'>;
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
  readonly limits: EvidenceLimits;
  readonly call: JudgementCall;
  readonly onAnswer?: (response: LlmResponse) => Promise<void>;
}

export type JudgedClaim = Pick<Claim, 'claimId' | 'text' | 'citations'>;

// RF-301
export function judgeClaim(
  parts: ClaimJudgeParts,
  claim: JudgedClaim,
  parentSpanId: string,
): Promise<Judgement> {
  const reason = `not built: ${parts.role.model} ${claim.claimId} ${parentSpanId}`;
  return Promise.resolve({ kind: 'judged', status: 'Unverified', reason });
}
