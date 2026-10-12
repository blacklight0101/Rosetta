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
import { maskRequest } from './mask-request.js';
import { requestExcerpts } from './request-excerpts.js';
import type { TextMasker } from './secret-masker.js';

// RF-141, RF-142, RF-143, RF-145, ADR-006, ADR-013, DEC-16, DEC-57: the decorator of LlmProvider
// through which every model call leaves the machine (architecture section 7). In order, before
// anything reaches the provider it wraps:
//   1. a provider off this machine is refused unless the run carries consent; the consent is fixed
//      when the guard is built for the run, so nothing in a request can grant it (RF-143);
//   2. repository content must sit in labelled data blocks: a data block in the system prompt, a
//      tool result that is not exactly one block, or a broken block is refused (RF-145);
//   3. every message part is masked (RF-141); the tool definitions are not: they come from code and
//      must never carry repository text (the agent loop, P1-31, keeps it that way);
//   4. the run record gets the secrets first sent by this agent task, per kind (RF-141);
//   5. last, the egress log gets the call's line: provider, model, role, agent task and the path
//      and line range of every excerpt, never their text (RF-142), so a line always means a call
//      that was sent.
// Every refusal and every failure of steps 3-5 takes one path: a security event with its code, one
// more blocked call in the manifest, the error thrown so the agent task stops; the call is never
// sent (fail closed). A failure without a code takes the code of its step.

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
  consent: 'A call to a provider off this machine was refused because the run has no consent.',
  masking: 'A model call was blocked because secret masking failed.',
  record: 'A model call was blocked because the run record could not be updated.',
  egressLog: 'A model call was blocked because its egress line could not be stored.',
  uncounted: 'A blocked model call could not be counted in the run record.',
} as const;

interface Step {
  /** The code of a failure that carries none. */
  readonly code: ErrorCode;
  readonly message: string;
}

const steps = {
  masking: { code: ERROR_CODES.secretMaskingFailed, message: messages.masking },
  record: { code: ERROR_CODES.runManifestFailed, message: messages.record },
  egressLog: { code: ERROR_CODES.egressLogFailed, message: messages.egressLog },
} as const satisfies Record<string, Step>;

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

  /** Masks the request, then records it: the manifest counts first, the egress line last. */
  private async prepare(request: LlmRequest, excerpts: readonly Citation[]): Promise<LlmRequest> {
    const { masker, security, egressLog, clock, target } = this.options;
    const { agentTaskId, callId, role } = request.context;
    const sentBefore = this.counted.get(agentTaskId) ?? 0;
    const masked = await this.step(request, steps.masking, () =>
      Promise.resolve(maskRequest(request, masker, sentBefore)),
    );
    await this.step(request, steps.record, () => security.addMasking(masked.firstSent));
    this.counted.set(agentTaskId, Math.max(sentBefore, request.messages.length));
    const at = clock.now().toISOString();
    const line = { at, callId, provider: target.provider, model: request.model, role, agentTaskId };
    await this.step(request, steps.egressLog, () =>
      egressLog.append({ ...line, excerpts, maskedCounts: masked.counts }),
    );
    return masked.request;
  }

  /** Runs one step; any failure blocks the call, with the failure's own code when it has one. */
  private async step<T>(request: LlmRequest, step: Step, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = error instanceof RosettaError ? error.code : step.code;
      return this.block(request, code, step.message, error);
    }
  }

  /** Logs the security event, counts the blocked call and stops the task with the code. */
  private async block(
    request: LlmRequest,
    code: ErrorCode,
    message: string,
    cause?: unknown,
  ): Promise<never> {
    const { logger, target } = this.options;
    const { runId, agentTaskId, callId } = request.context;
    const ids = { runId, agentTaskId, callId };
    await logger.securityEvent(code, {
      message,
      ...ids,
      data: { provider: target.provider, kind: target.kind },
    });
    await this.countBlocked(ids);
    throw new RosettaError(code, message, cause === undefined ? undefined : { cause });
  }

  /** A run record that cannot count the blocked call does not hide the call's own failure. */
  private async countBlocked(ids: {
    readonly runId: string;
    readonly agentTaskId: string;
    readonly callId: string;
  }): Promise<void> {
    try {
      await this.options.security.addBlockedCall();
    } catch (error) {
      const code = error instanceof RosettaError ? error.code : ERROR_CODES.runManifestFailed;
      await this.options.logger.log({
        level: 'error',
        logger: 'security',
        message: messages.uncounted,
        code,
        ...ids,
      });
    }
  }
}
