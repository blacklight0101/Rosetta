import { join } from 'node:path';
import { LimitCounter } from '../../src/infrastructure/sources/entry-guards.js';
import {
  DEFAULT_WORKBOOK_LIMITS,
  type WorkbookLimits,
} from '../../src/infrastructure/sources/workbook/workbook-limits.js';
import type { WorkbookModel } from '../../src/infrastructure/sources/workbook/workbook-model.js';
import { readWorkbook } from '../../src/infrastructure/sources/workbook/workbook-reader.js';
import { buildZip, writeZipFile, type ZipItem } from './zip-fixtures.js';

// P3-44: workbooks are built inside the tests from first-party content: the smallest OOXML parts
// that Excel itself writes, zipped with yazl. Nothing is committed and nothing comes from a real file.

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const SHEET_TYPE = `${REL_NS}/worksheet`;
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export interface SheetSpec {
  readonly name: string;
  /** A whole worksheet part; the default is an empty `sheetData`. */
  readonly xml?: string;
  readonly state?: 'hidden' | 'veryHidden';
  /** The content of `xl/worksheets/_rels/sheetN.xml.rels`, as relationship elements. */
  readonly rels?: string;
}

export interface WorkbookSpec {
  readonly sheets: readonly SheetSpec[];
  /** The plain strings of `xl/sharedStrings.xml`; `rawSharedStrings` replaces the whole part. */
  readonly sharedStrings?: readonly string[];
  readonly rawSharedStrings?: string;
  readonly styles?: string;
  /** Elements placed in `workbook.xml` after the sheets (names, pivot caches, ...). */
  readonly workbookExtra?: string;
  /** Relationship elements added to `xl/_rels/workbook.xml.rels`. */
  readonly workbookRels?: string;
  readonly extraParts?: readonly ZipItem[];
  /** Sheet numbers (1-based) whose part is left out of the package. */
  readonly omitSheetParts?: readonly number[];
  readonly omitWorkbookXml?: boolean;
  /** Replaces `xl/workbook.xml` with these bytes. */
  readonly rawWorkbookXml?: string;
  readonly date1904?: boolean;
}

export function worksheet(rows: string, after = ''): string {
  return `${XML_HEAD}<worksheet xmlns="${MAIN_NS}"><sheetData>${rows}</sheetData>${after}</worksheet>`;
}

export function row(number: number, cells: string): string {
  return `<row r="${String(number)}">${cells}</row>`;
}

export function numberCell(address: string, value: number, style?: number): string {
  const s = style === undefined ? '' : ` s="${String(style)}"`;
  return `<c r="${address}"${s}><v>${String(value)}</v></c>`;
}

export function sharedCell(address: string, index: number): string {
  return `<c r="${address}" t="s"><v>${String(index)}</v></c>`;
}

export function formulaCell(address: string, formula: string, cached?: string, type = ''): string {
  const t = type === '' ? '' : ` t="${type}"`;
  const v = cached === undefined ? '' : `<v>${cached}</v>`;
  return `<c r="${address}"${t}><f>${formula}</f>${v}</c>`;
}

function workbookXml(spec: WorkbookSpec): string {
  const sheets = spec.sheets
    .map((sheet, i) => {
      const state = sheet.state === undefined ? '' : ` state="${sheet.state}"`;
      const id = String(i + 1);
      return `<sheet name="${sheet.name}" sheetId="${id}"${state} r:id="rId${id}"/>`;
    })
    .join('');
  const pr = spec.date1904 === true ? '<workbookPr date1904="1"/>' : '';
  return `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">${pr}<sheets>${sheets}</sheets>${spec.workbookExtra ?? ''}</workbook>`;
}

function workbookRels(spec: WorkbookSpec): string {
  const rels = spec.sheets
    .map((_sheet, i) => {
      const id = String(i + 1);
      return `<Relationship Id="rId${id}" Type="${SHEET_TYPE}" Target="worksheets/sheet${id}.xml"/>`;
    })
    .join('');
  return `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}">${rels}${spec.workbookRels ?? ''}</Relationships>`;
}

function sharedStringsXml(strings: readonly string[]): string {
  const items = strings.map((text) => `<si><t>${text}</t></si>`).join('');
  const count = String(strings.length);
  return `${XML_HEAD}<sst xmlns="${MAIN_NS}" count="${count}" uniqueCount="${count}">${items}</sst>`;
}

function packageParts(spec: WorkbookSpec): ZipItem[] {
  const parts: ZipItem[] = [
    {
      name: '[Content_Types].xml',
      data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    },
    {
      name: '_rels/.rels',
      data: `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels(spec) },
  ];
  if (spec.omitWorkbookXml !== true)
    parts.push({ name: 'xl/workbook.xml', data: spec.rawWorkbookXml ?? workbookXml(spec) });
  spec.sheets.forEach((sheet, i) => {
    const number = i + 1;
    if (spec.omitSheetParts?.includes(number) === true) return;
    parts.push({
      name: `xl/worksheets/sheet${String(number)}.xml`,
      data: sheet.xml ?? worksheet(''),
    });
    if (sheet.rels !== undefined) {
      parts.push({
        name: `xl/worksheets/_rels/sheet${String(number)}.xml.rels`,
        data: `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}">${sheet.rels}</Relationships>`,
      });
    }
  });
  if (spec.rawSharedStrings !== undefined) {
    parts.push({ name: 'xl/sharedStrings.xml', data: spec.rawSharedStrings });
  } else if (spec.sharedStrings !== undefined) {
    parts.push({ name: 'xl/sharedStrings.xml', data: sharedStringsXml(spec.sharedStrings) });
  }
  if (spec.styles !== undefined) parts.push({ name: 'xl/styles.xml', data: spec.styles });
  return [...parts, ...(spec.extraParts ?? [])];
}

/** The bytes of a minimal workbook package. */
export function buildWorkbook(spec: WorkbookSpec): Promise<Buffer> {
  return buildZip(packageParts(spec));
}

/** `n` sheets named Sheet1..Sheet<n>, each empty. */
export function emptySheets(count: number): SheetSpec[] {
  return Array.from({ length: count }, (_, i) => ({ name: `Sheet${String(i + 1)}` }));
}

/** A `cellXfs` list: `formats` maps a style index to a number format id or code. */
export function stylesXml(
  formats: readonly (number | string)[],
  custom: Readonly<Record<number, string>> = {},
): string {
  const numFmts = Object.entries(custom)
    .map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${code}"/>`)
    .join('');
  const xfs = formats.map((id) => `<xf numFmtId="${String(id)}"/>`).join('');
  return `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}"><numFmts count="${String(Object.keys(custom).length)}">${numFmts}</numFmts><cellXfs count="${String(formats.length)}">${xfs}</cellXfs></styleSheet>`;
}

export interface ReadOptions {
  readonly limits?: Partial<WorkbookLimits>;
  readonly fileName?: string;
  /** Shared by several reads to count the cells of a whole project. */
  readonly cells?: LimitCounter;
  readonly signal?: AbortSignal;
}

/** Writes `bytes` below `root` as the uploaded file and reads it with the default limits, or the given ones. */
export async function readBuilt(
  root: string,
  bytes: Buffer,
  options: ReadOptions = {},
): Promise<WorkbookModel> {
  const fileName = options.fileName ?? 'Book.xlsx';
  const path = await writeZipFile(join(root, 'upload'), fileName, bytes);
  const limits = { ...DEFAULT_WORKBOOK_LIMITS, ...options.limits };
  const cells = options.cells ?? new LimitCounter(limits.maxCells);
  return readWorkbook(
    { path, fileName },
    limits,
    cells,
    options.signal ?? new AbortController().signal,
  );
}
