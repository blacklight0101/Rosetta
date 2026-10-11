import type { IdGenerator } from '../../src/application/ports/id-generator.js';

const SECONDS_PER_DAY = 86_400;

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** Predictable ids: UUIDs count up from 1; run ids start at 2026-01-01 00:00:01 and move one second per id. */
export class SequenceIdGenerator implements IdGenerator {
  private uuidCount = 0;
  private runCount = 0;

  runId(stage: string): string {
    this.runCount += 1;
    const seconds = this.runCount % SECONDS_PER_DAY;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const stamp = `${twoDigits(hours)}${twoDigits(minutes)}${twoDigits(seconds % 60)}`;
    return `20260101-${stamp}-${stage}`;
  }

  uuid(): string {
    this.uuidCount += 1;
    return `00000000-0000-4000-8000-${String(this.uuidCount).padStart(12, '0')}`;
  }
}
