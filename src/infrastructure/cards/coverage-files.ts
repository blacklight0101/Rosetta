import type { AreaCoverage, LineRange } from '../../domain/cards/area-coverage.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { ObjectCoverage } from '../../domain/cards/database-objects.js';
import { objectsSection } from './coverage-objects.js';
import { surfaceSection } from './coverage-surface.js';
import { markdownEscaper, type MarkdownEscaper } from './markdown-text.js';

// RF-230, data-model 3.8: `coverage.json` (per area every file with the line ranges its task read,
// and the share of the area's tokens read) and `coverage.md`, its readable form: a run summary
// table, then one table per area. Both keep the area order of the run and hold no times, so the
// same coverage always gives the same bytes. Paths and area names are escaped as text (RF-507).

const schemaVersion = 1;

export function serialiseCoverage(
  coverage: readonly AreaCoverage[],
  masker: TextMasker,
  objects: readonly ObjectCoverage[] = [],
): string {
  const areas = coverage.map(
    ({ area, files, tokens, readTokens, readTokenShare, failure, surface, note }) => ({
      area,
      files: files.map(({ path, read }) => ({
        path,
        read: read.map(({ startLine, endLine }) => ({ startLine, endLine })),
      })),
      tokens,
      readTokens,
      readTokenShare,
      failure,
      surface,
      note,
    }),
  );
  return `${JSON.stringify(
    maskDeep(
      { schemaVersion, areas, ...(objects.length === 0 ? {} : { databaseObjects: objects }) },
      masker,
    ),
    null,
    2,
  )}\n`;
}

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

function filesRead(coverage: AreaCoverage): number {
  return coverage.files.filter((file) => file.read.length > 0).length;
}

function summaryRow(name: string, read: number, files: number, share: string): string {
  return `| ${name} | ${String(read)} of ${String(files)} | ${share} |`;
}

function runSummary(coverage: readonly AreaCoverage[], esc: MarkdownEscaper): string[] {
  const rows = coverage.map((area) =>
    summaryRow(
      esc.inline(area.area),
      filesRead(area),
      area.files.length,
      percent(area.readTokenShare),
    ),
  );
  const sum = (count: (area: AreaCoverage) => number): number =>
    coverage.reduce((total, area) => total + count(area), 0);
  const tokens = sum((area) => area.tokens);
  const share = tokens === 0 ? 0 : sum((area) => area.readTokens) / tokens;
  const total = summaryRow(
    'All areas',
    sum(filesRead),
    sum((area) => area.files.length),
    percent(share),
  );
  return [
    '## Run summary',
    '',
    "The share of each area's estimated tokens in the lines its agent read.",
    '',
    '| Area | Files read | Area tokens read |',
    '|---|---|---|',
    ...rows,
    total,
    '',
    ...failedAreas(coverage, esc),
    ...areaNotes(coverage, esc),
  ];
}

/** RF-206, RF-243: the areas with a note (not read, no application logic); nothing when none has one. */
function areaNotes(coverage: readonly AreaCoverage[], esc: MarkdownEscaper): string[] {
  const noted = coverage.filter((area) => area.note !== undefined);
  if (noted.length === 0) return [];
  return [
    '## Notes',
    '',
    ...noted.map((area) => `- ${esc.inline(area.area)}: ${esc.inline(area.note ?? '')}`),
    '',
  ];
}

/** RF-208: the areas whose task gave no usable card, with why; nothing when there are none. */
function failedAreas(coverage: readonly AreaCoverage[], esc: MarkdownEscaper): string[] {
  const failed = coverage.filter((area) => area.failure !== undefined);
  if (failed.length === 0) return [];
  return [
    '## Failed areas',
    '',
    'These areas gave no usable card, so the specification has nothing about them.',
    '',
    ...failed.map((area) => `- ${esc.inline(area.area)}: ${esc.inline(area.failure ?? '')}`),
    '',
  ];
}

function rangesText(read: readonly LineRange[]): string {
  if (read.length === 0) return 'not read';
  return read.map((range) => `${String(range.startLine)}-${String(range.endLine)}`).join(', ');
}

function areaSection(coverage: AreaCoverage, esc: MarkdownEscaper): string[] {
  return [
    `## Area: ${esc.inline(coverage.area)}`,
    '',
    '| File | Read lines |',
    '|---|---|',
    ...coverage.files.map(
      (file) => `| ${esc.inline(file.path)} | ${esc.inline(rangesText(file.read))} |`,
    ),
    '',
  ];
}

export function renderCoverage(
  coverage: readonly AreaCoverage[],
  masker: TextMasker,
  objects: readonly ObjectCoverage[] = [],
): string {
  const esc = markdownEscaper(masker);
  const lines = [
    '# Coverage',
    '',
    ...runSummary(coverage, esc),
    ...surfaceSection(coverage, esc),
    ...objectsSection(objects, esc),
    ...coverage.flatMap((area) => areaSection(area, esc)),
  ];
  return `${masker.mask(lines.join('\n')).text.trimEnd()}\n`;
}
