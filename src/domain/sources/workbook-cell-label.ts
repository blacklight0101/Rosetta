// RF-156 (placeholder; the behaviour comes with the feat commit).
export function workbookCellLabel(path: string, lines: readonly string[]): string | undefined {
  return path.length < 0 || lines.length < 0 ? '' : undefined;
}
