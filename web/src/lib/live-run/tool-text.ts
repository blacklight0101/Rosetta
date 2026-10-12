// RF-1002: how a tool call is written in a panel and in the log, for example
// `read_file Catalog/Edit.aspx.cs:40-80`. The arguments are what the event carries: paths, line
// ranges and patterns, never file content.

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function where(args: Readonly<Record<string, unknown>>): string | undefined {
  const path = stringOf(args['path']);
  if (path === undefined) return undefined;
  const start = numberOf(args['startLine']);
  const end = numberOf(args['endLine']);
  return start === undefined || end === undefined
    ? path
    : `${path}:${String(start)}-${String(end)}`;
}

/** The tool name followed by what it was asked about. */
// RF-1002
export function toolText(tool: string, args: Readonly<Record<string, unknown>> = {}): string {
  const pattern = stringOf(args['pattern']);
  const target =
    where(args) ??
    (pattern === undefined ? undefined : `"${pattern}"`) ??
    stringOf(args['pathGlob']) ??
    stringOf(args['symbol']);
  return target === undefined ? tool : `${tool} ${target}`;
}

/** The path of a `read_file` call, which counts as a file read once the call succeeded. */
export function readPathOf(
  tool: string,
  args: Readonly<Record<string, unknown>> = {},
): string | undefined {
  return tool === 'read_file' ? stringOf(args['path']) : undefined;
}
