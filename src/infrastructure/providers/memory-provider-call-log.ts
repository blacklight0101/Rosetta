import type {
  ProviderCallRecord,
  ProviderCallRecorder,
  TranscriptEntry,
} from '../../application/ports/provider-call-recorder.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { callLine, transcriptLine, transcriptRef } from './provider-call-lines.js';

function parsed(lines: readonly string[]): unknown[] {
  return lines.map((line): unknown => JSON.parse(line));
}

// RF-408: keeps the masked lines of the call log and the transcripts in memory, exactly as the
// JSON Lines log would write them; for tests and runs that keep no files.
export class MemoryProviderCallLog implements ProviderCallRecorder {
  private readonly masker: TextMasker;
  private readonly calls: string[] = [];
  private readonly transcripts = new Map<string, string[]>();

  constructor(masker: TextMasker) {
    this.masker = masker;
  }

  // A masking failure rejects the promise before anything is kept.
  record(call: ProviderCallRecord): Promise<void> {
    return Promise.resolve().then(() => {
      this.calls.push(callLine(call, this.calls.length + 1, this.masker));
    });
  }

  transcript(agentTaskId: string, entries: readonly TranscriptEntry[]): Promise<string> {
    return Promise.resolve().then(() => {
      const lines = this.lines(agentTaskId);
      const ref = transcriptRef(agentTaskId, lines.length + 1);
      const added = entries.map((entry, index) =>
        transcriptLine(entry, lines.length + 1 + index, this.masker),
      );
      this.transcripts.set(agentTaskId, [...lines, ...added]);
      return ref;
    });
  }

  private lines(agentTaskId: string): readonly string[] {
    return this.transcripts.get(agentTaskId) ?? [];
  }

  /** The call log as the JSON Lines file would hold it. */
  callsText(): string {
    return this.calls.join('');
  }

  /** The agent task's transcript as its JSON Lines file would hold it. */
  transcriptText(agentTaskId: string): string {
    return this.lines(agentTaskId).join('');
  }

  /** The call records, parsed. */
  records(): unknown[] {
    return parsed(this.calls);
  }

  /** The agent task's transcript lines, parsed. */
  transcriptLines(agentTaskId: string): unknown[] {
    return parsed(this.lines(agentTaskId));
  }
}
