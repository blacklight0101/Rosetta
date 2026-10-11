import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger, LogValue } from '../../application/ports/logger.js';
import type {
  GrepRequest,
  GrepResult,
  LineRange,
  ReadLinesRequest,
  ReadRefusal,
  ReadRefusalReason,
  RepositoryReader,
  SkippedPaths,
} from '../../application/ports/repository-reader.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { cutLine, grepLimits, isPatternTooLong } from './grep-limits.js';
import { runGrep, type GrepFile } from './grep-runner.js';
import { IgnoreRules, pathFilter } from './ignore-rules.js';
import { cutNotice, isSecurityRefusal, refusal } from './read-refusals.js';
import { checkRepositoryPath, isInside } from './repository-path.js';
import { indexSnapshot, type SnapshotIndex } from './snapshot-index.js';
import { checkedScope } from './snapshot-scope.js';

// RF-005, RF-140, RF-146, RF-147, ADR-006, ADR-013: read-only access to one snapshot.

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
}

interface ReaderState {
  readonly realRoot: string;
  readonly scope: string;
  readonly rules: IgnoreRules;
  readonly index: SnapshotIndex;
  readonly logger: Logger;
  readonly timeoutMs: number;
}

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
  readonly #state: ReaderState;

  private constructor(state: ReaderState) {
    this.#state = state;
    this.liftedDenyPatterns = state.rules.liftedDenyPatterns;
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
      logger: options.logger,
      timeoutMs: options.grepTimeoutMs ?? grepLimits.timeoutMs,
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
    const lines = splitLines(await readFile(access.value, 'utf8'));
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

  async grep(request: GrepRequest): Promise<Result<GrepResult, ReadRefusal>> {
    if (isPatternTooLong(request.pattern)) {
      return this.#refuse('pattern-too-long', { patternLength: request.pattern.length });
    }
    const files = await this.#searchedFiles(request.pathGlob);
    const outcome = await runGrep(request.pattern, files, this.#state.timeoutMs);
    switch (outcome.kind) {
      case 'timeout':
        return this.#refuse('timeout', { timeoutMs: this.#state.timeoutMs });
      case 'invalid-pattern':
        return this.#refuse('invalid-pattern', { detail: outcome.detail });
      case 'matches':
        return ok(grepResult(files, outcome.matches));
    }
  }

  async #searchedFiles(pathGlob: string | undefined): Promise<SearchedFile[]> {
    const selected = pathGlob === undefined ? () => true : pathFilter(pathGlob);
    const searched: SearchedFile[] = [];
    for (const path of await this.listFiles()) {
      if (!selected(path)) continue;
      const absolute = await this.#realFile(path);
      if (absolute === undefined) continue;
      const cut = splitLines(await readFile(absolute, 'utf8')).map(cutLine);
      searched.push({
        path,
        lines: cut.map((line) => line.text),
        cut: cut.map((line) => line.cut),
      });
    }
    return searched;
  }

  /**
   * The absolute path of an indexed file, only while it still resolves inside the root and is not
   * hard-linked (a hard link could share its content with a file outside the snapshot).
   */
  async #realFile(path: string): Promise<string | undefined> {
    const real = await realpath(join(this.#state.realRoot, ...path.split('/'))).catch(
      () => undefined,
    );
    if (real === undefined || !isInside(this.#state.realRoot, real)) return undefined;
    const stats = await stat(real);
    return stats.nlink > 1 ? undefined : real;
  }

  async #access(path: string): Promise<Result<string, ReadRefusal>> {
    const problem = this.#pathProblem(path);
    if (problem !== undefined) return this.#refuse(problem, { path });
    if (!this.#state.index.files.includes(path)) return this.#refuse('not-found', { path });
    const real = await this.#realFile(path);
    return real === undefined ? this.#refuse('outside-root', { path }) : ok(real);
  }

  #pathProblem(path: string): ReadRefusalReason | undefined {
    const checked = checkRepositoryPath(path);
    if (!checked.ok) return checked.error;
    const { scope, index, rules } = this.#state;
    if (!isUnder(path, scope)) return 'outside-root';
    if (index.links.some((link) => isUnder(path, link))) return 'outside-root';
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

interface SearchedFile extends GrepFile {
  readonly cut: readonly boolean[];
}

function grepResult(
  files: readonly SearchedFile[],
  matches: readonly { readonly path: string; readonly line: number }[],
): GrepResult {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const found = matches.map(({ path, line }) => {
    const file = byPath.get(path);
    return { path, line, text: file?.lines[line - 1] ?? '', cut: file?.cut[line - 1] ?? false };
  });
  const cutLines = files.reduce((total, file) => total + file.cut.filter(Boolean).length, 0);
  return cutLines === 0
    ? { matches: found, cutLines }
    : { matches: found, cutLines, notice: cutNotice };
}
