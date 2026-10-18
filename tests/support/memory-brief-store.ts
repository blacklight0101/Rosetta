import type { PlanningBriefStore } from '../../src/application/ports/planning-brief-store.js';
import type { PlanningBrief } from '../../src/domain/planning/planning-brief.js';
import { buildBrief } from '../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from './planning-brief-harness.js';

// RST-1801: the saved planning brief of each project, kept in memory, for the tests that only need
// to know whether a project has one.

export class MemoryBriefStore implements PlanningBriefStore {
  private readonly saved = new Map<string, PlanningBrief>();

  read(project: { readonly projectId: string }): Promise<PlanningBrief | undefined> {
    return Promise.resolve(this.saved.get(project.projectId));
  }

  write(project: { readonly projectId: string }, brief: PlanningBrief): Promise<void> {
    this.saved.set(project.projectId, brief);
    return Promise.resolve();
  }

  /** Saves the brief of an owner who has answered nothing. */
  async saveEmpty(project: { readonly userId: string; readonly projectId: string }): Promise<void> {
    const brief = { ...buildBrief({}, shippedCatalogue), savedAt: '2026-10-12T10:00:00.000Z' };
    await this.write(project, brief);
  }
}
