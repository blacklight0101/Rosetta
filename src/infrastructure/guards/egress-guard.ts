import type { Clock } from '../../application/ports/clock.js';
import type { EgressLog } from '../../application/ports/egress-log.js';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../application/ports/llm-provider.js';
import type { Logger } from '../../application/ports/logger.js';
import { needsCloudConsent } from '../../application/providers/cloud-consent.js';
import type { RunSecurityRecorder } from '../../application/runs/run-security-record.js';
import type { Citation } from '../../domain/cards/citation.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { ProviderTarget } from '../providers/call-attempts.js';
import { maskRequest, type MaskedRequest } from './mask-request.js';
import { requestExcerpts } from './request-excerpts.js';
import type { TextMasker } from './secret-masker.js';

// RF-141, RF-142, RF-143, RF-145, ADR-006, ADR-013, DEC-16, DEC-57: the decorator of LlmProvider
// through which every model call leaves the machine (architecture section 7). In order, before
// anything reaches the provider it wraps:
//   1. a non-local provider is refused unless the run carries consent; the consent is fixed when
//      the guard is built for the run, so nothing in a request can grant it (RF-143);
//   2. repository content must sit in labelled data blocks: a data block in the system prompt, a
//      tool result that is not exactly one block, or a broken block is refused (RF-145);
//   3. every message part is masked (RF-141); a masker failure blocks the call;
//   4. the egress log gets the call's line: provider, model, role, agent task and the path and
//      line range of every excerpt, never their text (RF-142);
//   5. the run record gets the secrets first sent by this agent task, per kind (RF-141).
// Every refusal is logged as a security event with its code, counted in the manifest as a blocked
// call and thrown, so the agent task stops; the call is never sent (fail closed).

export interface EgressGuardOptions {
  readonly inner: LlmProvider;
  readonly target: ProviderTarget;
  /** RF-143: the consent the run recorded when it was started; never read from a request. */
  readonly cloudConsent: boolean;
  readonly masker: TextMasker;
  readonly egressLog: EgressLog;
  readonly security: RunSecurityRecorder;
  readonly logger: Logger;
  readonly clock: Clock;
}

const messages = {
  consent: 'A call to a cloud provider was refused because the run has no consent for it.',
  masking: 'A model call was blocked because secret masking failed.',
} as const;

function isMaskingFailure(error: unknown): boolean {
  return error instanceof RosettaError && error.code === ERROR_CODES.secretMaskingFailed;
}

export class EgressGuard implements LlmProvider {
  private readonly options: EgressGuardOptions;
  /** Per agent task: how many messages the run record has counted the secrets of. */
  private readonly counted = new Map<string, number>();

  constructor(options: EgressGuardOptions) {
    this.options = options;
  }

  // RF-141, RF-142, RF-143, RF-145
  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const excerpts = await this.inspect(request);
    const masked = await this.prepare(request, excerpts);
    return this.options.inner.complete(masked, observer);
  }

  /** The excerpts of a request that may leave; a refused request is blocked. */
  private async inspect(request: LlmRequest): Promise<readonly Citation[]> {
    const { target, cloudConsent } = this.options;
    if (needsCloudConsent(target) && !cloudConsent) {
      return this.block(request, ERROR_CODES.cloudConsentMissing, messages.consent);
    }
    const excerpts = requestExcerpts(request);
    if (!excerpts.ok) return this.block(request, ERROR_CODES.egressMessageRefused, excerpts.error);
    return excerpts.value;
  }

  /** Masks the request and records it; a masking failure blocks the call. */
  private async prepare(request: LlmRequest, excerpts: readonly Citation[]): Promise<LlmRequest> {
    const { agentTaskId } = request.context;
    const sentBefore = this.counted.get(agentTaskId) ?? 0;
    try {
      const masked = maskRequest(request, this.options.masker, sentBefore);
      await this.record(request, excerpts, masked);
      this.counted.set(agentTaskId, Math.max(sentBefore, request.messages.length));
      return masked.request;
    } catch (error) {
      if (!isMaskingFailure(error)) throw error;
      return this.block(request, ERROR_CODES.secretMaskingFailed, messages.masking, error);
    }
  }

  private async record(
    request: LlmRequest,
    excerpts: readonly Citation[],
    masked: MaskedRequest,
  ): Promise<void> {
    const { egressLog, security, clock, target } = this.options;
    const { callId, role, agentTaskId } = request.context;
    await egressLog.append({
      at: clock.now().toISOString(),
      callId,
      provider: target.provider,
      model: request.model,
      role,
      agentTaskId,
      excerpts,
      maskedCounts: masked.counts,
    });
    await security.addMasking(masked.firstSent);
  }

  /** Logs the security event, counts the blocked call and stops the task with the code. */
  private async block(
    request: LlmRequest,
    code: ErrorCode,
    message: string,
    cause?: unknown,
  ): Promise<never> {
    const { logger, security, target } = this.options;
    const { runId, agentTaskId, callId } = request.context;
    await logger.securityEvent(code, {
      message,
      runId,
      agentTaskId,
      callId,
      data: { provider: target.provider, kind: target.kind },
    });
    await security.addBlockedCall();
    throw new RosettaError(code, message, cause === undefined ? undefined : { cause });
  }
}
