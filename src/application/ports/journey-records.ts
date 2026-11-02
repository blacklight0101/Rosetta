import type { JourneyRecord } from '../../domain/journey/journey-record.js';

// RF-011, RF-1105, ADR-027: the journey record of a project (data-model.md section 4, `journeys`).
// One per project; reads are scoped by the owner, so another user's project has none.
export interface JourneyRecords {
  /** The project's journey; undefined when none, and for another user's project. */
  find(userId: string, projectId: string): Promise<JourneyRecord | undefined>;
  /** Records the journey of a project, replacing the one it had (a new Analyse is a new journey). */
  save(record: JourneyRecord): Promise<void>;
}
