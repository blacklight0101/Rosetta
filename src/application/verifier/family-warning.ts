import { modelFamilyOf, sameModelFamily } from '../../domain/verifier/model-family.js';
import type { LogRecord } from '../ports/logger.js';

// RF-301, DEC-57: the warning an understand run logs when it starts with a `verifier` of the
// `reader`'s model family. It names the self-preference risk; the run continues.

/** The warning for these two models, or undefined when their families differ. */
// RF-301
export function sameFamilyWarning(
  readerModel: string,
  verifierModel: string,
): LogRecord | undefined {
  if (!sameModelFamily(readerModel, verifierModel)) return undefined;
  const family = modelFamilyOf(verifierModel);
  return {
    level: 'warn',
    logger: 'understand',
    message:
      `The verifier uses the reader's model family (${family}). A model tends to judge the claims of ` +
      'its own family as supported (self-preference), so treat the verdicts with care, or give ' +
      'the verifier a model of another family. The run continues.',
    data: { readerModel, verifierModel, family },
  };
}
