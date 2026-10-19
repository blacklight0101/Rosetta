import { builtinFormat } from './builtin-formats.js';
import type { Attributes, XmlVisitor } from './xml-stream.js';

// RF-152: `xl/styles.xml` read for one thing, the number format of each cell style.

const GENERAL = 'General';

export class StylesReader implements XmlVisitor {
  private readonly custom = new Map<number, string>();
  private readonly formatIds: number[] = [];
  private inCellXfs = false;

  open(name: string, attributes: Attributes): void {
    if (name === 'numFmt') {
      this.custom.set(Number(attributes['numFmtId']), attributes['formatCode'] ?? '');
    } else if (name === 'cellXfs') {
      this.inCellXfs = true;
    } else if (name === 'xf' && this.inCellXfs) {
      this.formatIds.push(Number(attributes['numFmtId'] ?? 0));
    }
  }

  close(name: string): void {
    if (name === 'cellXfs') this.inCellXfs = false;
  }

  /** The format code of a style index; `undefined` for General, a missing style or an unknown id. */
  formatOf(style: number | undefined): string | undefined {
    const id = style === undefined ? undefined : this.formatIds[style];
    if (id === undefined || id === 0) return undefined;
    const code = this.custom.get(id) ?? builtinFormat(id);
    return code === GENERAL ? undefined : code;
  }
}
