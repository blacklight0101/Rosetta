import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { formatCitation } from '../../domain/cards/citation.js';
import { statedVolumes } from '../../domain/planning/data-volumes.js';
import type { ScanShapes } from '../../domain/planning/scan-shapes.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { idLink, handoffFiles, shapeSections } from './handoff-links.js';

// RF-632, RF-603, DEC-135: `fixtures.md`, the shapes of the real repository and data that tests of
// limits and parsers must meet. Every number is measured by code from the scan, never written by a
// model; the file names come from the repository, so they go through the escaper like any other text.
// The headings are the anchors the task cards link (handoff-links.ts, `shapeSections`).

const NOT_MEASURED = 'Not measured.';

function size(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/** A name with its spaces at the edge of a segment and its control characters written out. */
function visibleName(path: string): string {
  const written = (code: number): string =>
    `[U+${code.toString(16).toUpperCase().padStart(4, '0')}]`;
  const segment = (text: string): string =>
    Array.from({ length: text.length }, (_none, at) => {
      const code = text.charCodeAt(at);
      const edge = code === 0x20 && (at === 0 || at === text.length - 1);
      return code < 0x20 || edge ? written(code) : text.charAt(at);
    }).join('');
  return path.split('/').map(segment).join('/');
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string[] {
  if (rows.length === 0) return ['None found.'];
  const rule = header.map(() => '---');
  return [header, rule, ...rows].map((row) => `| ${row.join(' | ')} |`);
}

function section(title: string, lines: readonly string[]): string[] {
  return [`## ${title}`, '', ...lines, ''];
}

function measuredSections(shapes: ScanShapes, esc: MarkdownEscaper): string[] {
  const { largest, byKind, deepest, unusualNames, encodings, lineEndings } = shapes;
  return [
    ...section(
      shapeSections.largest,
      table(
        ['File', 'Kind', 'Size'],
        largest.map((file) => [esc.inline(file.path), file.kind, size(file.bytes)]),
      ),
    ),
    ...section(
      shapeSections.byKind,
      table(
        ['Kind', 'Files', 'Size'],
        byKind.map((each) => [each.kind, String(each.files), size(each.bytes)]),
      ),
    ),
    ...section(
      shapeSections.deepest,
      table(
        ['Path', 'Depth'],
        deepest.map((each) => [esc.inline(each.path), String(each.depth)]),
      ),
    ),
    ...section(
      shapeSections.unusual,
      unusualNames.length === 0
        ? ['None found.']
        : unusualNames.map(
            (each) => `- ${esc.inline(visibleName(each.path))}: ${each.reasons.join('; ')}`,
          ),
    ),
    ...section(
      shapeSections.encodings,
      table(
        ['Encoding', 'Files'],
        encodings.map((each) => [each.name, String(each.files)]),
      ),
    ),
    ...section(
      shapeSections.lineEndings,
      table(
        ['Line ending', 'Files'],
        lineEndings.map((each) => [each.name, String(each.files)]),
      ),
    ),
  ];
}

function unmeasuredSections(): string[] {
  const titles = Object.values(shapeSections).filter((title) => title !== shapeSections.volumes);
  return titles.flatMap((title) => section(title, [NOT_MEASURED]));
}

function volumeLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const volumes = statedVolumes(handoff.sources);
  if (volumes.length === 0) return ['The cards state no data volume.'];
  return volumes.map(
    (volume) =>
      `- ${idLink(volume.cardId, handoffFiles.sources)} ${esc.inline(volume.claimId)}: ${esc.inline(volume.text)} Citations: ${volume.citations.map((citation) => esc.inline(formatCitation(citation))).join(', ')}`,
  );
}

function introLines(shapes: ScanShapes | undefined): string[] {
  const lead =
    'The shapes of the legacy repository that tests of a limit or a parser must meet. They were measured by code from the scan, not written by a model; task cards that add a limit or a parser link the sections they must handle.';
  if (shapes === undefined) {
    return [
      lead,
      '',
      'The scan of the analysed commit could not be read, so no shape was measured. Run the analysis again to measure them.',
      '',
    ];
  }
  const unread =
    shapes.unreadable === 0
      ? []
      : [
          `${String(shapes.unreadable)} file${shapes.unreadable === 1 ? '' : 's'} could not be read and is not counted.`,
          '',
        ];
  const skipped =
    shapes.beyondTotal === 0
      ? []
      : [
          `${String(shapes.beyondTotal)} file${shapes.beyondTotal === 1 ? ' was' : 's were'} sized but ${shapes.beyondTotal === 1 ? 'its' : 'their'} content was not read: the total read limit was reached.`,
          '',
        ];
  const counted = `${String(shapes.files)} files, ${size(shapes.totalBytes)} in all.`;
  return [lead, '', `Measured: ${counted}`, '', ...unread, ...skipped];
}

/** P5-08: the intro of a workbook project, whose data is in sheets, rows and cells, not in repository files. */
function workbookIntroLines(): string[] {
  return [
    'The legacy system is one or more workbooks, so its data is in sheets, rows and cells, not in repository files. The files of the scan are the text renderings of the workbooks; their size, depth, encoding and line endings say nothing about the data a test must meet, so they are not listed here.',
    '',
    'Task cards that add a limit or a parser handle the volumes the cards state below (rows of a sheet, records of a table) and the cells of [workbook-formulas.md](workbook-formulas.md): build the test data from the sheets, rows and cells of the workbook itself.',
    '',
  ];
}

// RF-632
export function fixturesMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const { shapes } = handoff;
  if (handoff.workbookFormulas !== undefined) {
    return [
      '# Realistic data shapes',
      '',
      ...workbookIntroLines(),
      ...section(shapeSections.volumes, volumeLines(handoff, esc)),
    ].join('\n');
  }
  return [
    '# Realistic data shapes',
    '',
    ...introLines(shapes),
    ...(shapes === undefined ? unmeasuredSections() : measuredSections(shapes, esc)),
    ...section(shapeSections.volumes, volumeLines(handoff, esc)),
  ].join('\n');
}
