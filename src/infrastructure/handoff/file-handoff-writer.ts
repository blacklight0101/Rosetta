import type { HandoffWriter } from '../../application/ports/handoff-writer.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-601, RF-603: the hand-off package written into `handoff/` (not built yet).

export interface FileHandoffWriterOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

// RF-601, RF-603
export const renderHandoff: (
  handoff: HandoffPackage,
  masker: TextMasker,
) => Readonly<Record<string, string>> = () => ({});

export class FileHandoffWriter implements HandoffWriter {
  readonly options: FileHandoffWriterOptions;

  constructor(options: FileHandoffWriterOptions) {
    this.options = options;
  }

  // RF-601, RF-603
  readonly write: (scope: RunScope, handoff: HandoffPackage) => Promise<readonly string[]> = () =>
    Promise.resolve([]);
}
