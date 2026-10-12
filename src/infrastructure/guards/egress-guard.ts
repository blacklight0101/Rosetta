import type { Clock } from '../../application/ports/clock.js';
import type { EgressLog } from '../../application/ports/egress-log.js';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../application/ports/llm-provider.js';
import type { Logger } from '../../application/ports/logger.js';
import type { RunSecurityRecorder } from '../../application/runs/run-security-record.js';
import type { ProviderTarget } from '../providers/call-attempts.js';
import type { TextMasker } from './secret-masker.js';

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

export class EgressGuard implements LlmProvider {
  constructor(_options: EgressGuardOptions) {}

  complete(_request: LlmRequest, _observer?: LlmAttemptObserver): Promise<LlmResponse> {
    return Promise.reject(new Error('not implemented'));
  }
}
