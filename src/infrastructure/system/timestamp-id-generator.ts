import { randomUUID } from 'node:crypto';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';

// RNF-004: run ids are yyyyMMdd-HHmmss-<stage> in UTC (data-model.md section 2).
export class TimestampIdGenerator implements IdGenerator {
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  runId(stage: string): string {
    // toISOString is "yyyy-MM-ddTHH:mm:ss.sssZ"
    const [date = '', time = ''] = this.clock.now().toISOString().split('T');
    const stamp = `${date.replaceAll('-', '')}-${time.slice(0, 8).replaceAll(':', '')}`;
    return `${stamp}-${stage}`;
  }

  uuid(): string {
    return randomUUID();
  }
}
