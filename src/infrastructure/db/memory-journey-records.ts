import type { JourneyRecords } from '../../application/ports/journey-records.js';
import type { JourneyRecord } from '../../domain/journey/journey-record.js';

// RF-011, RF-1105: the journey records in memory, for unit tests; same contract as PgJourneyRecords.
export class MemoryJourneyRecords implements JourneyRecords {
  private readonly records = new Map<string, JourneyRecord>();

  find(userId: string, projectId: string): Promise<JourneyRecord | undefined> {
    const record = this.records.get(projectId);
    return Promise.resolve(record?.userId === userId ? record : undefined);
  }

  save(record: JourneyRecord): Promise<void> {
    this.records.set(record.projectId, record);
    return Promise.resolve();
  }
}
