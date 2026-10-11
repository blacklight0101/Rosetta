import { randomUUID } from 'node:crypto';
import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { Stats } from 'node:fs';
import type { Logger } from '../../application/ports/logger.js';
import type {
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
  WriteRefusalReason,
} from '../../application/ports/output-writer.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { isInside } from './repository-path.js';
import { linkProblem, writeRefusal, type WorkspaceRoots } from './workspace-guard.js';
import {
  checkWorkspacePath,
  isUserId,
  snapshotCacheRoot,
  workspaceRoot,
} from './workspace-paths.js';

// RF-005, data-model sections 1, 2 and 6: writes only inside `<data>/users/<userId>/`. Every
// folder on the way is checked not to be a link, so no write can be redirected into the snapshot
// cache or anywhere else.

export interface NodeOutputWriterOptions {
  /** `ROSETTA_DATA_DIR`. */
  readonly dataDir: string;
  readonly logger: Logger;
}

type Mode = 'read' | 'append' | 'replace';

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function statOrUndefined(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error: unknown) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

export class NodeOutputWriter implements OutputWriter {
  readonly #dataDir: string;
  readonly #logger: Logger;

  constructor(options: NodeOutputWriterOptions) {
    this.#dataDir = options.dataDir;
    this.#logger = options.logger;
  }

  async writeText(file: WorkspaceFile, content: string): Promise<Result<void, WriteRefusal>> {
    const target = await this.#resolve(file, 'replace');
    if (!target.ok) return target;
    const temporary = join(dirname(target.value), `.${basename(target.value)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
      const moved = await this.#parentProblem(target.value, file.userId);
      if (moved !== undefined) {
        await rm(temporary, { force: true });
        return await this.#refuse(moved, file);
      }
      await rename(temporary, target.value);
    } catch (error: unknown) {
      await rm(temporary, { force: true });
      throw error;
    }
    return ok(undefined);
  }

  async appendLine(file: WorkspaceFile, line: string): Promise<Result<void, WriteRefusal>> {
    const target = await this.#resolve(file, 'append');
    if (!target.ok) return target;
    const moved = await this.#parentProblem(target.value, file.userId);
    if (moved !== undefined) return this.#refuse(moved, file);
    await appendFile(target.value, `${line}\n`, 'utf8');
    return ok(undefined);
  }

  async readText(file: WorkspaceFile): Promise<Result<string, WriteRefusal>> {
    const target = await this.#resolve(file, 'read');
    if (!target.ok) return target;
    try {
      return ok(await readFile(target.value, 'utf8'));
    } catch (error: unknown) {
      if (hasCode(error, 'ENOENT')) return this.#refuse('not-found', file);
      throw error;
    }
  }

  async #resolve(file: WorkspaceFile, mode: Mode): Promise<Result<string, WriteRefusal>> {
    if (!isUserId(file.userId)) return this.#refuse('outside-workspace', file);
    const checked = checkWorkspacePath(file.path);
    if (!checked.ok) return this.#refuse(checked.error, file);
    if (mode !== 'read') await mkdir(this.#dataDir, { recursive: true });
    const roots = await this.#roots(file.userId);
    if (roots === undefined) return this.#refuse('not-found', file);
    const segments = ['users', file.userId, ...file.path.split('/')];
    let current = roots.data;
    for (const [position, segment] of segments.entries()) {
      current = join(current, segment);
      const isLast = position === segments.length - 1;
      const problem = await this.#checkStep(current, roots, isLast ? mode : 'folder', mode);
      if (problem !== undefined) return this.#refuse(problem, file);
    }
    return ok(current);
  }

  /**
   * Checks again, just before the file is used, that its folder still resolves inside the
   * workspace: narrows the window in which a folder swapped for a link could redirect the write.
   */
  async #parentProblem(target: string, userId: string): Promise<WriteRefusalReason | undefined> {
    const roots = await this.#roots(userId);
    const parent = await realpath(dirname(target)).catch(() => undefined);
    if (roots === undefined || parent === undefined) return 'outside-workspace';
    if (isInside(roots.workspace, parent)) return undefined;
    return isInside(roots.sources, parent) ? 'snapshot-cache' : 'outside-workspace';
  }

  async #roots(userId: string): Promise<WorkspaceRoots | undefined> {
    const data = await realpath(this.#dataDir).catch(() => undefined);
    if (data === undefined) return undefined;
    const cache = snapshotCacheRoot(data);
    const sources = await realpath(cache).catch(() => cache);
    return { data, sources, workspace: workspaceRoot(data, userId) };
  }

  /** Checks one path on the way down; creates a missing folder unless only reading. */
  async #checkStep(
    path: string,
    roots: WorkspaceRoots,
    step: Mode | 'folder',
    mode: Mode,
  ): Promise<WriteRefusalReason | undefined> {
    const stats = await statOrUndefined(path);
    if (stats === undefined) {
      if (step !== 'folder') return undefined;
      if (mode === 'read') return 'not-found';
      await mkdir(path).catch((error: unknown) => {
        if (!hasCode(error, 'EEXIST')) throw error;
      });
      return this.#checkStep(path, roots, step, 'read');
    }
    if (stats.isSymbolicLink()) return linkProblem(path, roots);
    if (step === 'append' && stats.nlink > 1) return 'outside-workspace';
    return isInside(roots.workspace, path) || step === 'folder' ? undefined : 'outside-workspace';
  }

  async #refuse(
    reason: WriteRefusalReason,
    file: WorkspaceFile,
  ): Promise<Result<never, WriteRefusal>> {
    const refused = writeRefusal(reason);
    if (reason !== 'not-found') {
      await this.#logger.securityEvent(refused.code, {
        message: `Workspace write refused: ${reason}.`,
        data: { path: file.path },
        userId: file.userId,
      });
    }
    return err(refused);
  }
}
