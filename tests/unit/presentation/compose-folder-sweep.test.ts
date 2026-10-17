import { describe, expect, it, vi } from 'vitest';
import { ORPHAN_FOLDER_MIN_AGE_MS } from '../../../src/application/projects/folder-sweep.js';
import { MemoryProjectRepository } from '../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../src/infrastructure/db/memory-run-index.js';
import {
  folderSweepTask,
  startScheduledTasks,
} from '../../../src/presentation/compose-schedule.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { ManualScheduler } from '../../support/manual-scheduler.js';
import { MemoryWorkspaceFolders } from '../../support/memory-workspace-folders.js';
import { RecordingLogger } from '../../support/recording-logger.js';

// P1-152, RF-1012: the sweep of folders without rows runs at start-up and every 24 hours, and is
// stopped with the other scheduled tasks by the shutdown.

const DAY = 86_400_000;
const orphan = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000f1',
};

function setUp() {
  const folders = new MemoryWorkspaceFolders();
  folders.seed(orphan, { 'a.txt': '1' }, 0);
  const clock = new FixedClock('2026-10-17T09:00:00.000Z');
  clock.advance(ORPHAN_FOLDER_MIN_AGE_MS * 2);
  const task = folderSweepTask({
    projects: new MemoryProjectRepository(),
    runs: new MemoryRunIndex(),
    folders,
    clock,
    logger: new RecordingLogger(),
  });
  return { folders, task, scheduler: new ManualScheduler(() => undefined) };
}

describe('folderSweepTask', () => {
  it('P1-152 repeats every 24 hours and also runs at start-up', () => {
    const { task } = setUp();

    expect(task.intervalMs).toBe(DAY);
    expect(task.runAtStart).toBe(true);
  });

  it('P1-152 sweeps at start-up without waiting for the first interval', async () => {
    const { folders, task, scheduler } = setUp();

    startScheduledTasks(scheduler, [task]);

    await vi.waitFor(() => {
      expect(folders.removals).toEqual([orphan]);
    });
  });

  it('P1-152 stops when the shutdown cancels the tasks', () => {
    const { task, scheduler } = setUp();
    const cancels = startScheduledTasks(scheduler, [task]);

    for (const cancel of cancels) cancel();

    expect(scheduler.activeJobs).toBe(0);
  });
});
