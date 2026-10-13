import type { EpochMs } from '../../domain/accounts/user.js';
import type {
  ProjectRepository,
  StoredProject,
} from '../../application/ports/project-repository.js';
import type { Project } from '../../application/projects/project.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { DatabaseClient, DatabasePool } from './pool.js';
import { PROJECT_COLUMNS, toProject } from './project-rows.js';

// Architecture section 7, ADR-016, RF-010, RF-1105: projects in PostgreSQL with parameterised SQL
// only. Every statement filters on `user_id`, so another user's project id finds nothing. The
// unique constraint `projects_source_key` makes the same source one project per user, also under
// two parallel requests. A database failure is thrown as RST-2404 with the cause.

const INSERT =
  'INSERT INTO projects (id, user_id, name, source_url, ref, subpath, settings, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) ON CONFLICT ON CONSTRAINT projects_source_key DO NOTHING';
const SELECT = 'SELECT ' + PROJECT_COLUMNS + ' FROM projects';
const FIND_BY_SOURCE =
  SELECT + ' WHERE user_id = $1 AND source_url = $2 AND ref = $3 AND subpath = $4';
const LIST = SELECT + ' WHERE user_id = $1 ORDER BY created_at DESC, id';
const FIND = SELECT + ' WHERE user_id = $1 AND id = $2';
const UPDATE_SETTINGS =
  'UPDATE projects SET settings = $3::jsonb, updated_at = $4 WHERE user_id = $1 AND id = $2 RETURNING ' +
  PROJECT_COLUMNS;

// RF-1012, P1-121: the removal is one transaction. It first locks the project row (`FOR UPDATE`
// waits for a transaction that is inserting a run of the project, whose foreign key check holds a
// key-share lock on the row, and keeps any later insert waiting until the end). Each following
// statement takes a fresh snapshot, so a run queued in the meantime is seen and the project stays.
// The hook (the folder removal) runs under the lock, before the rows go; when it fails nothing is
// removed. The runs of the project go with it (ON DELETE CASCADE). `cost_ledger` has no foreign key
// to either, so its rows stay (DEC-55).
const LOCK = 'SELECT id FROM projects WHERE user_id = $1 AND id = $2 FOR UPDATE';
const IN_USE =
  "SELECT 1 FROM runs WHERE user_id = $1 AND project_id = $2 AND queue_state <> 'Ended' LIMIT 1";
const REMOVE =
  "DELETE FROM projects WHERE user_id = $1 AND id = $2 AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.project_id = projects.id AND runs.queue_state <> 'Ended')";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

/** One statement of a transaction; a database failure is thrown as RST-2404 with the cause. */
async function query(
  client: DatabaseClient,
  sql: string,
  values: unknown[],
): Promise<{ readonly rowCount: number | null }> {
  try {
    return await client.query(sql, values);
  } catch (error) {
    throw queryFailed(error);
  }
}

export class PgProjectRepository implements ProjectRepository {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async insertOrFind(project: Project): Promise<StoredProject> {
    const inserted = await this.run(INSERT, [
      project.id,
      project.userId,
      project.name,
      project.sourceUrl,
      project.ref,
      project.subpath,
      JSON.stringify(project.settings),
      new Date(project.createdAt),
      new Date(project.updatedAt),
    ]);
    if (inserted.rowCount === 1) return { project, created: true };
    const [row] = (
      await this.run(FIND_BY_SOURCE, [
        project.userId,
        project.sourceUrl,
        project.ref,
        project.subpath,
      ])
    ).rows;
    if (row === undefined) throw queryFailed(new Error('The project vanished after a conflict'));
    return { project: toProject(row), created: false };
  }

  async list(userId: string): Promise<readonly Project[]> {
    if (!UUID.test(userId)) return [];
    return (await this.run(LIST, [userId])).rows.map(toProject);
  }

  async find(userId: string, projectId: string): Promise<Project | undefined> {
    // Not a UUID cannot name a row; asking PostgreSQL would fail on the uuid cast.
    if (!UUID.test(userId) || !UUID.test(projectId)) return undefined;
    const [row] = (await this.run(FIND, [userId, projectId])).rows;
    return row === undefined ? undefined : toProject(row);
  }

  async updateSettings(
    userId: string,
    projectId: string,
    settings: ProjectSettings,
    updatedAt: EpochMs,
  ): Promise<Project | undefined> {
    if (!UUID.test(userId) || !UUID.test(projectId)) return undefined;
    const [row] = (
      await this.run(UPDATE_SETTINGS, [
        userId,
        projectId,
        JSON.stringify(settings),
        new Date(updatedAt),
      ])
    ).rows;
    return row === undefined ? undefined : toProject(row);
  }

  async remove(
    userId: string,
    projectId: string,
    afterRowsGone: () => Promise<void>,
  ): Promise<boolean> {
    if (!UUID.test(userId) || !UUID.test(projectId)) return false;
    const values = [userId, projectId];
    const removed = await this.transaction(async (client) => {
      if ((await query(client, LOCK, values)).rowCount !== 1) return false;
      if ((await query(client, IN_USE, values)).rowCount !== 0) return false;
      return (await query(client, REMOVE, values)).rowCount === 1;
    });
    // The connection and the row lock are released: a slow disk holds neither (P1-138).
    if (removed) await afterRowsGone();
    return removed;
  }

  /** Commits what `work` did, or rolls it back and rethrows when it throws or answers false. */
  private async transaction(work: (client: DatabaseClient) => Promise<boolean>): Promise<boolean> {
    let client: DatabaseClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw queryFailed(error);
    }
    try {
      await query(client, 'BEGIN', []);
      const done = await work(client);
      await query(client, done ? 'COMMIT' : 'ROLLBACK', []);
      return done;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async run(
    sql: string,
    values: unknown[],
  ): Promise<{ readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }> {
    try {
      return await this.pool.query<Record<string, unknown>>(sql, values);
    } catch (error) {
      throw queryFailed(error);
    }
  }
}
