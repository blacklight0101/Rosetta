import type { Card } from '../../domain/cards/card.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { ErrorCode } from '../../domain/errors/codes.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PlanOptions } from '../../domain/planning/plan-options.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LlmProvider, LlmResponse } from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import type { RoleProvider } from '../providers/provider-set.js';

// RF-608, RF-609, ADR-018, ADR-007: Plan setup's options. Stub until the feature commit.

export interface PlanOptionsParts {
  readonly provider: LlmProvider;
  readonly role: Pick<RoleProvider, 'model' | 'maxOutputTokens' | 'temperature'>;
  /** `planner/options.v<n>.md`, the system prompt with the placeholder for the styles. */
  readonly prompt: PromptFile;
  readonly logger: Logger;
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
  readonly runId: string;
  /** One per run, 32 hexadecimal characters. */
  readonly traceId: string;
  readonly nextCallId: () => string;
  readonly signal: AbortSignal;
  /** Called with the planner's answer (manifest records). */
  readonly onAnswer: (response: LlmResponse) => Promise<void>;
}

export interface PlanOptionsInput {
  readonly codeMap: CodeMap;
  readonly cards: readonly Card[];
  readonly catalogue: Catalogue;
}

export interface PlanOptionsProblem {
  readonly code: ErrorCode;
  readonly message: string;
}

export function recommendPlanOptions(
  parts: PlanOptionsParts,
  input: PlanOptionsInput,
): Promise<Result<PlanOptions, PlanOptionsProblem>> {
  return Promise.resolve(
    err({
      code: ERROR_CODES.providerCallFailed,
      message: `${parts.runId}${String(input.cards.length)}`,
    }),
  );
}
