import type { EgressLog } from '../../application/ports/egress-log.js';
import type { ProviderCallRecorder } from '../../application/ports/provider-call-recorder.js';
import type { ProviderSinks } from '../../application/ports/provider-set-factory.js';
import type { RunSecurityRecorder } from '../../application/runs/run-security-record.js';
import { transcriptRef } from './provider-call-lines.js';

// RF-407: a provider test belongs to no run and to no project, so it has no folder to log to. These
// sinks accept what the decorators write and keep nothing; the calls are still metered and capped
// (the ledger) and masked (the egress guard). Only the Test button may use them: its prompt is
// fixed and holds no repository content, so there is nothing for an egress line to name. A call
// that carries repository content must log (RF-142, RF-408): `projectCallSinks` does that for the
// options of Plan setup.

export type UnrecordedSinks = Pick<ProviderSinks, 'recorder' | 'egressLog' | 'security'>;

const recorder: ProviderCallRecorder = {
  record: () => Promise.resolve(),
  transcript: (agentTaskId) => Promise.resolve(transcriptRef(agentTaskId, 1)),
};

const egressLog: EgressLog = { append: () => Promise.resolve() };

const security: RunSecurityRecorder = {
  addMasking: () => Promise.resolve(),
  addBlockedCall: () => Promise.resolve(),
};

export function unrecordedSinks(): UnrecordedSinks {
  return { recorder, egressLog, security };
}
