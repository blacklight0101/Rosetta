import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { queuePositions } from '../../domain/runs/queue-rules.js';
import type { Run } from '../../domain/runs/run.js';
import type { PartlyRead, ReadRunPartlyRead } from './read-run-partly-read.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { WorkspaceFolders } from '../ports/workspace-folders.js';
import type { Project } from '../projects/project.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-1008, RF-1012, RF-1105: List history gives the history page the runs of one of the signed-in
// user's projects, newest first, each with the size of its folder, and the size of the project
// folder: what a deletion would free. Another user's project id and an unknown id give the same
// answer, so the answer never says whether a project exists.

export interface HistoryRun {
  readonly run: Run;
  /** The bytes the run folder holds; 0 when it has none (a run that never wrote one). */
  readonly sizeBytes: number;
  /** EV-80: the place of a queued run in the server's queue, counted from 1; null for any other run. */
  readonly position: number | null;
  /**
   * P8-89: the rounds a Deepen run has finished (0 until its first round ends), or null for a run
   * that is not a Deepen. Read from the manifest; a manifest that cannot be read counts as none.
   */
  readonly deepenRounds: number | null;
  /** P8-130: the areas below the coverage bar and the share of the code read, for the State badge. */
  readonly partlyRead: PartlyRead;
}

export interface RunHistory {
  readonly project: Project;
  readonly runs: readonly HistoryRun[];
  /** The bytes the project folder holds, its run folders included. */
  readonly sizeBytes: number;
}

export interface ListHistoryDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly folders: WorkspaceFolders;
  readonly manifests: Pick<RunManifestStore, 'read'>;
  readonly logger: Logger;
  readonly partlyRead: Pick<ReadRunPartlyRead, 'forListing'>;
}

/**
 * P8-89: the rounds of a Deepen run from its manifest (the record, or the options of a queued one). A
 * manifest that is missing, not valid JSON or cannot be read at all (a directory, no permission) counts as
 * none, so one bad run folder never hides the others; the unreadable ones are logged.
 */
async function deepenRoundsOf(
  deps: Pick<ListHistoryDependencies, 'manifests' | 'logger'>,
  run: Run,
): Promise<number | null> {
  if (run.stage !== 'understand') return null;
  try {
    const manifest = await deps.manifests.read(scopeOf(run));
    if (manifest?.deepen !== undefined) return manifest.deepen.roundsDone;
    return manifest !== undefined && 'deepen' in manifest.options ? 0 : null;
  } catch (error) {
    await deps.logger.log({
      level: 'warn',
      logger: 'history',
      message: `The manifest of run ${run.runKey} cannot be read; it is listed as not a Deepen.`,
      ...{ userId: run.userId, runId: run.runKey },
      data: { reason: error instanceof Error ? error.message : 'unknown' },
    });
    return null;
  }
}

export class ListHistory {
  private readonly deps: ListHistoryDependencies;

  constructor(deps: ListHistoryDependencies) {
    this.deps = deps;
  }

  // RF-1008
  async execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<RunHistory, typeof ERROR_CODES.notFound>> {
    const { projects, runs, folders } = this.deps;
    const { userId } = request.actor;
    const project = await projects.find(userId, request.projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const positions = queuePositions(await runs.listQueued());
    const listed: HistoryRun[] = [];
    const all = await runs.list(userId, project.id);
    const partlyRead = this.deps.partlyRead.forListing(all);
    for (const run of all) {
      const sizeBytes = await folders.size({ userId, projectId: project.id, runKey: run.runKey });
      const position = positions.get(run.id) ?? null;
      const deepenRounds = await deepenRoundsOf(this.deps, run);
      listed.push({ run, sizeBytes, position, deepenRounds, partlyRead: await partlyRead.of(run) });
    }
    const sizeBytes = await folders.size({ userId, projectId: project.id });
    return ok({ project, runs: listed, sizeBytes });
  }
}
