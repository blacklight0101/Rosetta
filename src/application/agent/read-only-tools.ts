import type { Area } from '../../domain/code-map/area.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { FileEntry } from '../../domain/code-map/file-entry.js';
import { renderDataBlock, type DataBlockSource } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { isRepositoryPath } from '../../domain/sources/permalink.js';
import type { ToolCall, ToolDefinition } from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import { CodeMapIndex } from './code-map-index.js';
import { parseToolArguments, type ToolRequest } from './tool-arguments.js';
import { isReaderToolName, readerToolDefinitions, readerToolNames } from './tool-definitions.js';
import { defaultToolLimits, type ToolLimits } from './tool-limits.js';
import { readLinesBounded, runGrepBounded } from './tool-reads.js';
import type { ToolAnswer, ToolData, ToolError } from './tool-answer.js';
import {
  areaHeading,
  boundedList,
  detailLines,
  entityLine,
  fileLine,
  symbolLine,
} from './tool-text.js';

// RF-201, RF-145, ADR-006, ADR-013: the reader's four read-only tools. They read only files the
// code map lists, through the RepositoryReader (which has no write operation). Every argument is
// checked first; every answer, a result or an error the model can correct, is exactly one data
// block, as the egress guard requires. Every error is logged, and a path that tries to leave the
// repository is also a security event (DEC-57).

export interface ReadOnlyToolsOptions {
  readonly reader: RepositoryReader;
  readonly codeMap: CodeMap;
  /** The area of the agent task. */
  readonly area: Area;
  readonly logger: Logger;
  readonly limits?: Partial<ToolLimits>;
}

/** The ids of the call a tool runs for, for the log. */
export interface ToolCallIds {
  readonly runId: string;
  readonly agentTaskId: string;
  readonly callId: string;
}

export interface ToolOutcome {
  /** One rendered data block. */
  readonly content: string;
  readonly error?: ToolError;
}

const shownNameChars = 64;
const shownPathChars = 200;

const refusedPath =
  'The path must be relative to the repository root, with forward slashes and no "." or ".." parts. It was not read.';
const notListed =
  'There is no such file in the code map. Use list_area_files, grep or codemap_query to find the exact path.';

function render(source: DataBlockSource, data: ToolData): string {
  return renderDataBlock({ source, excerpts: data.excerpts, text: data.text });
}

function skippedMessage(file: FileEntry): string {
  return `The scan skipped ${file.path} (${file.skipped ?? 'skipped'}), so it cannot be read. Read other files instead.`;
}

export class ReadOnlyTools {
  readonly definitions: readonly ToolDefinition[] = readerToolDefinitions;
  private readonly reader: RepositoryReader;
  private readonly index: CodeMapIndex;
  private readonly area: Area;
  private readonly logger: Logger;
  private readonly limits: ToolLimits;

  constructor(options: ReadOnlyToolsOptions) {
    this.reader = options.reader;
    this.index = new CodeMapIndex(options.codeMap);
    this.area = options.area;
    this.logger = options.logger;
    this.limits = { ...defaultToolLimits, ...options.limits };
  }

  /** The list_area_files result as a data block; the task message carries it from the start. */
  areaOverview(): string {
    return render('list_area_files', this.listAreaFiles());
  }

  // RF-201
  async run(call: ToolCall, ids: ToolCallIds): Promise<ToolOutcome> {
    if (!isReaderToolName(call.name)) {
      const shown = call.name.slice(0, shownNameChars);
      const message = `There is no tool named "${shown}". The tools are: ${readerToolNames.join(', ')}.`;
      return this.failed('unknown_tool', { code: ERROR_CODES.toolUnknown, message }, ids);
    }
    const request = parseToolArguments(call.name, call.arguments, this.limits.maxReadLines);
    const answer = request.ok
      ? await this.answer(request.value, ids)
      : err({ code: ERROR_CODES.toolArgumentsInvalid, message: request.error });
    if (!answer.ok) return this.failed(call.name, answer.error, ids);
    return { content: render(call.name, answer.value) };
  }

  private async answer(request: ToolRequest, ids: ToolCallIds): Promise<ToolAnswer> {
    switch (request.tool) {
      case 'list_area_files':
        return ok(this.listAreaFiles());
      case 'read_file': {
        const file = await this.listedFile(request.path, ids);
        if (!file.ok) return file;
        return readLinesBounded(this.reader, { ...request, path: file.value.path }, this.limits);
      }
      case 'grep':
        return runGrepBounded(this.reader, request, {
          limits: this.limits,
          isListed: (path) => this.index.isListed(path),
        });
      case 'codemap_query':
        return request.by === 'symbol'
          ? ok(this.symbolQuery(request.value))
          : this.pathQuery(request.value, ids);
    }
  }

  private listAreaFiles(): ToolData {
    const files = this.area.files.flatMap((path) => {
      const found = this.index.resolve(path);
      return found.ok ? [fileLine(found.value)] : [];
    });
    const lines = [...areaHeading(this.area), ...this.bounded(files, 'files')];
    return { excerpts: [], text: lines.join('\n') };
  }

  private symbolQuery(name: string): ToolData {
    const { symbols, entities } = this.index.named(name);
    const lines = [...symbols.map(symbolLine), ...entities.map(entityLine)];
    if (lines.length === 0) {
      return { excerpts: [], text: `No symbol or entity named "${name}" in the code map.` };
    }
    return { excerpts: [], text: this.bounded(lines, 'entries').join('\n') };
  }

  private async pathQuery(path: string, ids: ToolCallIds): Promise<ToolAnswer> {
    const file = await this.listedFile(path, ids);
    if (!file.ok) return file;
    const details = this.index.details(file.value);
    // The SQL text is file content, so each statement is an excerpt for the egress log (RF-142).
    const excerpts = details.sqlStatements.map((statement) => ({
      path: statement.path,
      startLine: statement.line,
      endLine: statement.line,
    }));
    return ok({ excerpts, text: this.bounded(detailLines(details), 'entries').join('\n') });
  }

  private bounded(lines: readonly string[], what: string): string[] {
    const { maxListedItems: max, maxResultChars: maxChars } = this.limits;
    return boundedList(lines, { max, maxChars }, what);
  }

  /** The code map's entry for a path the model wrote, in the code map's own spelling. */
  private async listedFile(path: string, ids: ToolCallIds): Promise<Result<FileEntry, ToolError>> {
    if (!isRepositoryPath(path)) return this.refusePath(path, ids);
    const found = this.index.resolve(path);
    if (found.ok) {
      const file = found.value;
      if (file.skipped === undefined) return ok(file);
      return err({ code: ERROR_CODES.toolFileSkipped, message: skippedMessage(file) });
    }
    const message =
      found.error.kind === 'ambiguous'
        ? `Several files differ from this path only in letter case: ${found.error.candidates.join(', ')}. Use the exact path.`
        : notListed;
    return err({ code: ERROR_CODES.fileNotFound, message });
  }

  /** A path that leaves the repository or is not a plain relative path: a security event (RF-145). */
  private async refusePath(path: string, ids: ToolCallIds): Promise<Result<never, ToolError>> {
    const leaves = path.startsWith('/') || path.split(/[/\\]/).includes('..');
    const code = leaves ? ERROR_CODES.pathOutsideRoot : ERROR_CODES.pathInvalid;
    await this.logger.securityEvent(code, {
      message: 'An agent tool call named a path outside the repository; it was not read.',
      ...ids,
      data: { path: path.slice(0, shownPathChars) },
    });
    return err({ code, message: refusedPath });
  }

  private async failed(
    source: DataBlockSource,
    error: ToolError,
    ids: ToolCallIds,
  ): Promise<ToolOutcome> {
    await this.logger.log({
      level: 'warn',
      logger: 'agent',
      code: error.code,
      message: 'An agent tool call was refused; the agent got an error result.',
      ...ids,
      data: { tool: source },
    });
    const text = `error ${error.code}: ${error.message}`;
    return { content: render(source, { excerpts: [], text }), error };
  }
}
