import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger, LogValue } from '../../application/ports/logger.js';
import type {
  FileBytes,
  GrepRequest,
  GrepResult,
  LineRange,
  ReadBytesRequest,
  ReadLinesRequest,
  ReadRefusal,
  ReadRefusalReason,
  RepositoryReader,
  SkippedPaths,
} from '../../application/ports/repository-reader.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { readTextUpTo, readUpTo, utf8Text } from './bounded-read.js';
import { cutLine, grepLimits, isPatternTooLong } from './grep-limits.js';
import { budgetOrder, inPathOrder } from './grep-order.js';
import { grepResult, type SearchedFile, type SearchedFiles } from './grep-result.js';
import { runGrep } from './grep-runner.js';
import { IgnoreRules, pathFilter } from './ignore-rules.js';
import { isSecurityRefusal, refusal } from './read-refusals.js';
import { checkRepositoryPath, isInside } from './repository-path.js';
import { indexSnapshot, type SnapshotIndex } from './snapshot-index.js';
import { checkedScope } from './snapshot-scope.js';

// RF-005, RF-140, RF-144, RF-146, RF-147, ADR-006, ADR-013: read-only access to one snapshot.

export interface NodeRepositoryReaderOptions {
  /** The snapshot's repository tree (`<data>/sources/<owner>__<repo>@<sha>/files`). */
  readonly root: string;
  /** Repository-relative folder the run is limited to. */
  readonly subpath?: string;
  /** The project's `scan.ignoreRules`. */
  readonly ignoreRules: string;
  /** The project's `scan.allowDenied`. */
  readonly allowDenied: readonly string[];
  readonly logger: Logger;
  /** RF-146: defaults to 2 s. */
  readonly grepTimeoutMs?: number;
  /** The project's `scan.maxFileBytes`: larger files are never read or searched (RF-144, RF-146). */
  readonly maxFileBytes?: number;
  /** P1-160: the bytes one grep reads across all files; defaults to 32 MiB. */
  readonly grepMaxTotalBytes?: number;
}

interface ReaderState {
  readonly realRoot: string;
  readonly scope: string;
  readonly rules: IgnoreRules;
  readonly index: SnapshotIndex;
  readonly fileSet: ReadonlySet<string>;
  readonly linkSet: ReadonlySet<string>;
  readonly logger: Logger;
  readonly timeoutMs: number;
  readonly maxFileBytes: number;
  readonly grepBudget: number;
}

/** The default of `scan.maxFileBytes` (data-model.md 3.1), for a caller that has no settings. */
const defaultMaxFileBytes = 1_000_000;

const repositoryIgnoreFile = '.rosettaignore';

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function isUnder(path: string, folder: string): boolean {
  return folder === '' || path === folder || path.startsWith(`${folder}/`);
}

/** DEC-109: the committed `.rosettaignore`, read only when it is a regular file. */
async function readRepositoryRules(root: string): Promise<string> {
  const path = join(root, repositoryIgnoreFile);
  const stats = await lstat(path).catch(() => undefined);
  return stats?.isFile() === true ? readFile(path, 'utf8') : '';
}

export class NodeRepositoryReader implements RepositoryReader {
  readonly liftedDenyPatterns: readonly string[];
  readonly skippedPaths: SkippedPaths;
  readonly subpath: string;
  readonly #state: ReaderState;

  private constructor(state: ReaderState) {
    this.#state = state;
    this.liftedDenyPatterns = state.rules.liftedDenyPatterns;
    this.subpath = state.scope;
    this.skippedPaths = { links: state.index.links, invalidNames: state.index.invalidNames };
  }

  static async open(options: NodeRepositoryReaderOptions): Promise<NodeRepositoryReader> {
    const scope = await checkedScope(options.root, options.subpath, options.logger);
    const rules = new IgnoreRules({
      settingsRules: options.ignoreRules,
      repositoryRules: await readRepositoryRules(options.root),
      allowDenied: options.allowDenied,
    });
    const index = await indexSnapshot(options.root, scope);
    const state: ReaderState = {
      realRoot: await realpath(options.root),
      scope,
      rules,
      index,
      fileSet: new Set(index.files),
      linkSet: new Set(index.links),
      logger: options.logger,
      timeoutMs: options.grepTimeoutMs ?? grepLimits.timeoutMs,
      maxFileBytes: options.maxFileBytes ?? defaultMaxFileBytes,
      grepBudget: options.grepMaxTotalBytes ?? grepLimits.maxTotalBytes,
    };
    await NodeRepositoryReader.#recordLifted(options.logger, rules.liftedDenyPatterns);
    return new NodeRepositoryReader(state);
  }

  static async #recordLifted(logger: Logger, lifted: readonly string[]): Promise<void> {
    if (lifted.length === 0) return;
    await logger.log({
      level: 'warn',
      logger: 'files',
      message: 'Built-in deny patterns lifted by scan.allowDenied for this project.',
      data: { liftedDenyPatterns: [...lifted] },
    });
  }

  listFiles(): Promise<readonly string[]> {
    const { index, rules } = this.#state;
    return Promise.resolve(index.files.filter((path) => rules.verdict(path) === 'allowed'));
  }

  async readLines(request: ReadLinesRequest): Promise<Result<LineRange, ReadRefusal>> {
    const access = await this.#access(request.path);
    if (!access.ok) return access;
    const text = await readTextUpTo(access.value, this.#state.maxFileBytes);
    if (text === undefined) return this.#refuse('too-large', { path: request.path });
    const lines = splitLines(text);
    const { startLine, endLine } = request;
    const valid =
      Number.isInteger(startLine) &&
      Number.isInteger(endLine) &&
      startLine >= 1 &&
      startLine <= endLine &&
      startLine <= lines.length;
    if (!valid) return this.#refuse('invalid-range', { path: request.path });
    const last = Math.min(endLine, lines.length);
    return ok({
      path: request.path,
      startLine,
      endLine: last,
      totalLines: lines.length,
      lines: lines.slice(startLine - 1, last),
    });
  }

  async readBytes(request: ReadBytesRequest): Promise<Result<FileBytes, ReadRefusal>> {
    const limit = request.maxBytes;
    if (!Number.isSafeInteger(limit) || limit < 0) return this.#refuse('invalid-limit', { limit });
    const access = await this.#access(request.path);
    if (!access.ok) return access;
    const { size } = await stat(access.value);
    const bytes = size > limit ? undefined : await readUpTo(access.value, size, limit);
    return ok({ path: request.path, sizeBytes: bytes?.length ?? size, bytes });
  }

  async grep(request: GrepRequest): Promise<Result<GrepResult, ReadRefusal>> {
    if (isPatternTooLong(request.pattern)) {
      return this.#refuse('pattern-too-long', { patternLength: request.pattern.length });
    }
    const searched = await this.#searchedFiles(request);
    const outcome = await runGrep(request.pattern, searched.files, this.#state.timeoutMs);
    switch (outcome.kind) {
      case 'timeout':
        return this.#refuse('timeout', { timeoutMs: this.#state.timeoutMs });
      case 'invalid-pattern':
        return this.#refuse('invalid-pattern', { detail: outcome.detail });
      case 'matches':
        return ok(grepResult(searched, outcome.matches));
    }
  }

  // RF-146, P1-160: a file is read only while the search's total stays within its byte budget;
  // the repository's own files are read first (budgetOrder), and the answer keeps the path order.
  async #searchedFiles(request: GrepRequest): Promise<SearchedFiles> {
    const { maxFileBytes, grepBudget } = this.#state;
    const paths = (await this.listFiles()).filter(searchSelector(request));
    const files: SearchedFile[] = [];
    const counts = { tooLarge: 0, overBudget: 0 };
    let left = grepBudget;
    for (const path of budgetOrder(paths)) {
      const absolute = await this.#realFile(path);
      if (absolute === undefined) continue;
      const read = await budgetedRead(absolute, maxFileBytes, left);
      if (read.bytes === undefined) counts[read.skipped] += 1;
      else {
        left -= read.bytes.length;
        files.push(searchedFile(path, utf8Text(read.bytes)));
      }
    }
    return { files: inPathOrder(files, paths), ...counts, budget: grepBudget };
  }

  /**
   * The absolute path of an indexed file, only while it still resolves inside the root, still
   * exists and is not hard-linked (a hard link could share its content with a file outside the
   * snapshot). A file that vanishes between the two calls is refused like any other.
   */
  async #realFile(path: string): Promise<string | undefined> {
    const real = await realpath(join(this.#state.realRoot, ...path.split('/'))).catch(
      () => undefined,
    );
    if (real === undefined || !isInside(this.#state.realRoot, real)) return undefined;
    const stats = await stat(real).catch(() => undefined);
    return stats === undefined || stats.nlink > 1 ? undefined : real;
  }

  async #access(path: string): Promise<Result<string, ReadRefusal>> {
    const problem = this.#pathProblem(path);
    if (problem !== undefined) return this.#refuse(problem, { path });
    if (!this.#state.fileSet.has(path)) return this.#refuse('not-found', { path });
    const real = await this.#realFile(path);
    return real === undefined ? this.#refuse('outside-root', { path }) : ok(real);
  }

  #pathProblem(path: string): ReadRefusalReason | undefined {
    const checked = checkRepositoryPath(path);
    if (!checked.ok) return checked.error;
    const { scope, linkSet, rules } = this.#state;
    if (!isUnder(path, scope)) return 'outside-root';
    if (isUnderAny(path, linkSet)) return 'outside-root';
    const verdict = rules.verdict(path);
    return verdict === 'allowed' ? undefined : verdict;
  }

  async #refuse(
    reason: ReadRefusalReason,
    data: Readonly<Record<string, LogValue>>,
  ): Promise<Result<never, ReadRefusal>> {
    const refused = refusal(reason);
    if (isSecurityRefusal(reason)) {
      await this.#state.logger.securityEvent(refused.code, {
        message: `Repository read refused: ${reason}.`,
        data,
      });
    }
    return err(refused);
  }
}

/** Whether a listed file is searched: inside the request's path list and its path pattern. */
function searchSelector(request: GrepRequest): (path: string) => boolean {
  const { pathGlob, paths } = request;
  const globbed = pathGlob === undefined ? () => true : pathFilter(pathGlob);
  if (paths === undefined) return globbed;
  const wanted = new Set(paths);
  return (path) => wanted.has(path) && globbed(path);
}

/** Whether `path` is one of the folders in `folders`, or lies below one. */
function isUnderAny(path: string, folders: ReadonlySet<string>): boolean {
  if (folders.size === 0) return false;
  const parts = path.split('/');
  return parts.some((_, index) => folders.has(parts.slice(0, index + 1).join('/')));
}

type BudgetedRead =
  | { readonly bytes: Uint8Array }
  | { readonly bytes: undefined; readonly skipped: 'tooLarge' | 'overBudget' };

/**
 * P1-160: the bytes of a file a search reads, or why it is left out: larger than
 * `scan.maxFileBytes`, past what is `left` of the search's byte budget, or grown since it was
 * measured (read as too large). The read never takes more than the measured size.
 */
async function budgetedRead(
  path: string,
  maxFileBytes: number,
  left: number,
): Promise<BudgetedRead> {
  const { size } = await stat(path);
  if (size > maxFileBytes) return { bytes: undefined, skipped: 'tooLarge' };
  if (size > left) return { bytes: undefined, skipped: 'overBudget' };
  const bytes = await readUpTo(path, size, maxFileBytes);
  return bytes === undefined ? { bytes, skipped: 'tooLarge' } : { bytes };
}

function searchedFile(path: string, text: string): SearchedFile {
  const cut = splitLines(text).map(cutLine);
  return { path, lines: cut.map((line) => line.text), cut: cut.map((line) => line.cut) };
}
