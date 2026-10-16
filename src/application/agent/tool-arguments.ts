import { z } from 'zod';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { ReaderToolName } from './tool-definitions.js';
import { maxPathChars, maxQueryChars } from './tool-limits.js';

// RF-201, ADR-013: tool arguments are model output, so each tool's schema checks them before
// anything runs. Small models send line numbers as text (" 12 "), so a numeric string counts as a
// number; anything else that does not fit gets an error the model can act on.

export type ToolRequest =
  | { readonly tool: 'list_area_files' }
  | {
      readonly tool: 'read_file';
      readonly path: string;
      readonly startLine: number;
      readonly endLine: number;
    }
  | { readonly tool: 'grep'; readonly pattern: string; readonly pathGlob: string | undefined }
  | { readonly tool: 'codemap_query'; readonly by: 'symbol' | 'path'; readonly value: string };

const maxLineNumber = 999_999_999;
const lineMessage = 'must be a whole line number of 1 or more';

const lineNumber = z.union(
  [
    z.number().int().min(1).max(maxLineNumber),
    z
      .string()
      .trim()
      .regex(/^[1-9]\d{0,8}$/)
      .transform(Number),
  ],
  { error: lineMessage },
);
const path = z.string().trim().min(1).max(maxPathChars);
const query = z.string().trim().min(1).max(maxQueryChars);

// RF-144: a range longer than scan.excerptMaxLines is valid; the read is cut to the limit.
const readFileSchema = z
  .object({ path, startLine: lineNumber, endLine: lineNumber })
  .refine((args) => args.startLine <= args.endLine, {
    path: ['endLine'],
    message: 'must not be before startLine',
  });

const grepSchema = z.object({
  pattern: z.string().min(1).max(maxQueryChars),
  pathGlob: query.optional(),
});

const codemapSchema = z
  .object({ symbol: query.optional(), path: path.optional() })
  .refine((args) => (args.symbol === undefined) !== (args.path === undefined), {
    message: 'give exactly one of symbol and path',
  });

const usage: Readonly<Record<ReaderToolName, string>> = {
  list_area_files: 'list_area_files takes no arguments: {}.',
  read_file: 'Call read_file with {"path": "<file>", "startLine": <number>, "endLine": <number>}.',
  grep: 'Call grep with {"pattern": "<regular expression>", "pathGlob": "<optional glob>"}.',
  codemap_query: 'Call codemap_query with {"symbol": "<name>"} or {"path": "<file>"}.',
};

function problemText(tool: ReaderToolName, error: z.ZodError): string {
  const issues = error.issues
    .slice(0, 5)
    .map((issue) => {
      const where = issue.path.length === 0 ? 'arguments' : issue.path.map(String).join('.');
      return `${where}: ${issue.message.slice(0, 200)}`;
    })
    .join('; ');
  return `The arguments of ${tool} are not valid (${issues}). ${usage[tool]}`;
}

function parsed<T>(
  tool: ReaderToolName,
  result: z.ZodSafeParseResult<T>,
  build: (value: T) => ToolRequest,
): Result<ToolRequest, string> {
  return result.success ? ok(build(result.data)) : err(problemText(tool, result.error));
}

/** The checked request of a call to a known tool, or the message the model gets instead. */
// RF-201
export function parseToolArguments(
  tool: ReaderToolName,
  args: unknown,
): Result<ToolRequest, string> {
  switch (tool) {
    case 'list_area_files':
      return parsed(tool, z.object({}).safeParse(args), () => ({ tool }));
    case 'read_file':
      return parsed(tool, readFileSchema.safeParse(args), (value) => ({
        tool,
        ...value,
      }));
    case 'grep':
      return parsed(tool, grepSchema.safeParse(args), (value) => ({
        tool,
        pattern: value.pattern,
        pathGlob: value.pathGlob,
      }));
    case 'codemap_query':
      return parsed(tool, codemapSchema.safeParse(args), (value) =>
        value.symbol === undefined
          ? { tool, by: 'path', value: value.path ?? '' }
          : { tool, by: 'symbol', value: value.symbol },
      );
  }
}
