import type { CodeMap } from '../../../domain/code-map/code-map.js';
import { byCodeUnit } from '../../../domain/code-map/code-unit-order.js';

// RF-105, RF-112, RNF-007: `scan-summary.md`, a readable view of the code map (data-model 3.5). It
// is generated and never read back. The scan duration is the only value that differs between two
// scans of one commit, which is why it lives here and not in `codemap.json` (RF-106).

export interface ScanSummaryInput {
  readonly codeMap: CodeMap;
  /** How long the scan took, in whole milliseconds. */
  readonly durationMs: number;
}

interface Totals {
  files: number;
  lines: number;
  tokens: number;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${String(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

/** A name or path in a table cell: a vertical bar would end the cell, a line break the row. */
function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\r', ' ').replaceAll('\n', ' ');
}

function table(header: readonly string[], numeric: readonly boolean[], rows: string[][]): string {
  const rule = numeric.map((right) => (right ? '---:' : '---'));
  return [header, rule, ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function languageRows(codeMap: CodeMap): string[][] {
  const totals = new Map<string, Totals>();
  for (const file of codeMap.files) {
    const row = totals.get(file.language) ?? { files: 0, lines: 0, tokens: 0 };
    totals.set(file.language, {
      files: row.files + 1,
      lines: row.lines + file.lines,
      tokens: row.tokens + file.estimatedTokens,
    });
  }
  return [...totals.entries()]
    .sort(([a], [b]) => byCodeUnit(a, b))
    .map(([language, row]) => [
      cell(language),
      String(row.files),
      String(row.lines),
      String(row.tokens),
    ]);
}

function artefactRows(codeMap: CodeMap): string[][] {
  const counts = new Map<string, number>();
  for (const file of codeMap.files) {
    for (const kind of file.artefactKinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => byCodeUnit(a, b))
    .map(([kind, count]) => [kind, String(count)]);
}

function areaRows(codeMap: CodeMap): string[][] {
  return codeMap.areas.map((area) => [
    cell(area.name),
    String(area.files.length),
    String(area.estimatedTokens),
    area.mapLevel,
    area.origin,
  ]);
}

function skippedNote(codeMap: CodeMap): string {
  const count = (reason: string): number =>
    codeMap.files.filter((file) => file.skipped === reason).length;
  const notes = [
    count('too-large') > 0 ? `${String(count('too-large'))} skipped as too large` : '',
    count('binary') > 0 ? `${String(count('binary'))} skipped as binary` : '',
  ].filter((note) => note !== '');
  return notes.length === 0 ? '' : ` (${notes.join(', ')})`;
}

function headline(input: ScanSummaryInput): string[] {
  const { codeMap } = input;
  const subpath = codeMap.source.subpath === '' ? 'whole repository' : codeMap.source.subpath;
  const tokens = codeMap.files.reduce((sum, file) => sum + file.estimatedTokens, 0);
  const packs = codeMap.languagePacks.map((pack) => `${pack.name} ${pack.version}`).join(', ');
  return [
    `- Source: ${codeMap.source.owner}/${codeMap.source.repo} (${cell(subpath)})`,
    `- Commit: ${codeMap.source.commitSha}`,
    `- Scan duration: ${formatDuration(input.durationMs)}`,
    `- Files: ${String(codeMap.files.length)}${skippedNote(codeMap)}`,
    `- Estimated tokens: ${String(tokens)}`,
    `- Symbols: ${String(codeMap.symbols.length)}, links: ${String(codeMap.links.length)}, SQL statements: ${String(codeMap.sqlStatements.length)}, candidate entities: ${String(codeMap.entities.length)}`,
    `- Language packs: ${packs === '' ? 'none' : packs}`,
  ];
}

/** The text of `scan-summary.md`: source, languages, artefact counts and areas with map levels. */
export function renderScanSummary(input: ScanSummaryInput): string {
  const { codeMap } = input;
  const sections = [
    '# Scan summary',
    headline(input).join('\n'),
    '## Languages',
    table(
      ['Language', 'Files', 'Lines', 'Estimated tokens'],
      [false, true, true, true],
      languageRows(codeMap),
    ),
    '## Artefacts',
    table(['Kind', 'Files'], [false, true], artefactRows(codeMap)),
    '## Areas',
    table(
      ['Area', 'Files', 'Estimated tokens', 'Map level', 'Origin'],
      [false, true, true, false, false],
      areaRows(codeMap),
    ),
  ];
  return `${sections.join('\n\n')}\n`;
}
