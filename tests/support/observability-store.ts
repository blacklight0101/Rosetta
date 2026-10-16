import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import type { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FileRunCallReader } from '../../src/infrastructure/providers/file-run-call-reader.js';
import type { PlanningBriefStore } from '../../src/application/ports/planning-brief-store.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import { MemoryLogReader } from './memory-log-reader.js';
import type { MemoryLogger } from './memory-logger.js';
import { MemoryOutputWriter } from './memory-output-writer.js';

export interface ObservabilityStore {
  readonly callFiles: MemoryOutputWriter;
  readonly calls: FileRunCallReader;
  readonly logs: MemoryLogReader;
}

/** RF-1011: the run folders the call and transcript routes read, and the logger's own entries. */
export function observabilityStore(masker: SecretMasker, logger: MemoryLogger): ObservabilityStore {
  const callFiles = new MemoryOutputWriter();
  const calls = new FileRunCallReader({ reader: callFiles, masker });
  return { callFiles, calls, logs: new MemoryLogReader(logger) };
}

/** RF-1007, RF-605: the answers.md and planning-brief.json adapters over memory files. */
export function answerStore(masker: SecretMasker): {
  readonly answerFiles: MemoryOutputWriter;
  readonly answers: FileAnswersFile;
  readonly briefFiles: MemoryOutputWriter;
  readonly briefs: PlanningBriefStore;
} {
  const answerFiles = new MemoryOutputWriter();
  const briefFiles = new MemoryOutputWriter();
  return {
    ...{ answerFiles, answers: new FileAnswersFile({ writer: answerFiles, masker }) },
    ...{ briefFiles, briefs: new FilePlanningBriefStore({ writer: briefFiles, masker }) },
  };
}
