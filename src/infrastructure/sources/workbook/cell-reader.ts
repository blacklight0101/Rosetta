import type { LimitCounter } from '../entry-guards.js';
import { columnName, MAX_COLUMNS, MAX_ROWS, parseAddress, parseRowNumber } from './cell-address.js';
import type { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { quoted, workbookNotReadable, workbookTooLarge } from './workbook-errors.js';
import type { CellFormula, CellValue, FormulaKind, WorkbookCell } from './workbook-model.js';
import type { Attributes, XmlVisitor } from './xml-stream.js';

// RF-151, RF-152: the cells of one sheet part. A cell is kept when it holds a value or a formula;
// each one kept counts against the project's cell budget while the part streams.

export interface CellContext {
  readonly part: string;
  /** The workbook's file name, for the message of a refusal. */
  readonly fileName: string;
  readonly strings: readonly string[];
  readonly formatOf: (style: number | undefined) => string | undefined;
  /** The cells of the whole project, shared by the workbooks of one upload. */
  readonly budget: LimitCounter;
  readonly maxCells: number;
}

interface Draft {
  readonly address: string;
  readonly type: string;
  readonly style: number | undefined;
  formula: { kind: FormulaKind; range?: string; sharedIndex?: number } | undefined;
  formulaText: string;
  valueText: string;
  inlineText: string;
}

type Target = 'formula' | 'value' | 'inline';

const FORMULA_KINDS: Readonly<Record<string, FormulaKind>> = {
  shared: 'shared',
  array: 'array',
  dataTable: 'dataTable',
};

export class CellReader implements XmlVisitor {
  readonly cells: WorkbookCell[] = [];
  private readonly context: CellContext;
  private row = 0;
  private nextColumn = 0;
  private draft: Draft | undefined;
  private target: Target | undefined;
  private inlineActive = false;
  private phonetic = 0;

  constructor(context: CellContext) {
    this.context = context;
  }

  open(name: string, attributes: Attributes): void {
    if (name === 'row') {
      this.startRow(attributes['r']);
    } else if (name === 'c') {
      this.startCell(attributes);
    } else if (this.draft !== undefined) {
      this.openInCell(this.draft, name, attributes);
    }
  }

  private startRow(number: string | undefined): void {
    const row = number === undefined ? this.row + 1 : parseRowNumber(number);
    if (row === undefined || row > MAX_ROWS) throw this.outside('a row number');
    this.row = row;
    this.nextColumn = 0;
  }

  private outside(what: string): RosettaError {
    const { part, fileName } = this.context;
    return workbookNotReadable(part, `${what} is outside the sheet (workbook ${quoted(fileName)})`);
  }

  private startCell(attributes: Attributes): void {
    const given = attributes['r'];
    const position = this.positionOf(given);
    const address = given ?? `${columnName(position.column)}${String(this.row)}`;
    this.nextColumn = position.column + 1;
    const style = attributes['s'] === undefined ? undefined : Number(attributes['s']);
    this.draft = {
      address,
      type: attributes['t'] ?? 'n',
      style,
      formula: undefined,
      formulaText: '',
      valueText: '',
      inlineText: '',
    };
  }

  private positionOf(given: string | undefined): { column: number; row: number } {
    if (given === undefined) {
      if (this.nextColumn >= MAX_COLUMNS || this.row === 0) throw this.outside('a cell position');
      return { column: this.nextColumn, row: this.row };
    }
    const parsed = parseAddress(given);
    if (parsed === undefined) throw this.outside('a cell address');
    return parsed;
  }

  private openInCell(draft: Draft, name: string, attributes: Attributes): void {
    if (name === 'f') this.startFormula(draft, attributes);
    else if (name === 'v') this.target = 'value';
    else if (name === 'is') this.inlineActive = true;
    else if (name === 'rPh') this.phonetic += 1;
    else if (name === 't') this.startInlineText();
  }

  private startFormula(draft: Draft, attributes: Attributes): void {
    const range = attributes['ref'];
    const index = attributes['si'];
    draft.formula = {
      kind: FORMULA_KINDS[attributes['t'] ?? ''] ?? 'normal',
      ...(range === undefined ? {} : { range }),
      ...(index === undefined ? {} : { sharedIndex: Number(index) }),
    };
    this.target = 'formula';
  }

  private startInlineText(): void {
    if (this.inlineActive && this.phonetic === 0) this.target = 'inline';
  }

  text(text: string): void {
    const draft = this.draft;
    if (draft === undefined || this.target === undefined) return;
    if (this.target === 'formula') draft.formulaText += text;
    else if (this.target === 'value') draft.valueText += text;
    else draft.inlineText += text;
  }

  close(name: string): void {
    if (this.draft === undefined) return;
    if (name === 'c') {
      this.finishCell(this.draft);
      this.draft = undefined;
      this.inlineActive = false;
    } else if (name === 'f' || name === 'v' || name === 't') {
      this.target = undefined;
    } else if (name === 'rPh') {
      this.phonetic -= 1;
    }
  }

  private finishCell(draft: Draft): void {
    const value = this.valueOf(draft);
    if (value === undefined && draft.formula === undefined) return;
    if (!this.context.budget.add()) {
      throw workbookTooLarge('non-empty cells', this.context.maxCells);
    }
    const numberFormat = this.context.formatOf(draft.style);
    const formula: CellFormula | undefined =
      draft.formula === undefined ? undefined : { ...draft.formula, text: draft.formulaText };
    this.cells.push({
      address: draft.address,
      ...(value === undefined ? {} : { value }),
      ...(numberFormat === undefined ? {} : { numberFormat }),
      ...(formula === undefined ? {} : { formula }),
    });
  }

  private valueOf(draft: Draft): CellValue | undefined {
    const raw = draft.valueText;
    if (draft.type === 'inlineStr') {
      return draft.inlineText === '' ? undefined : { type: 'text', value: draft.inlineText };
    }
    // A formula can have an empty string as its result, which is a value.
    if (draft.type === 'str' && draft.formula !== undefined) return { type: 'text', value: raw };
    return raw === '' ? undefined : this.typed(draft.type, raw);
  }

  private typed(type: string, raw: string): CellValue {
    switch (type) {
      case 's':
        return { type: 'text', value: this.sharedString(raw) };
      case 'str':
        return { type: 'text', value: raw };
      case 'b':
        return { type: 'boolean', value: raw === '1' };
      case 'e':
        return { type: 'error', value: raw };
      case 'd':
        return { type: 'date', value: raw };
      default:
        return numberOrText(raw);
    }
  }

  private sharedString(raw: string): string {
    const text = this.context.strings[Number(raw)];
    if (text === undefined) {
      throw workbookNotReadable(this.context.part, 'a cell names a shared string that is missing');
    }
    return text;
  }
}

function numberOrText(raw: string): CellValue {
  const value = Number(raw);
  return Number.isFinite(value) ? { type: 'number', value } : { type: 'text', value: raw };
}
