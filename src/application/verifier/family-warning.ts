import type { LogRecord } from '../ports/logger.js';

// RF-301: the self-preference warning (P2-02, not built yet).

// RF-301
export function sameFamilyWarning(
  readerModel: string,
  verifierModel: string,
): LogRecord | undefined {
  return readerModel === verifierModel ? undefined : undefined;
}
