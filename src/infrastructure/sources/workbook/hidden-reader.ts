import { columnName, MAX_COLUMNS, parseRowNumber } from './cell-address.js';
import type { HiddenLines } from './workbook-model.js';
import type { Attributes, XmlVisitor } from './xml-stream.js';

// RF-152, RFC-005 section 4.4: the hidden rows and columns of one sheet part, kept as ranges so a
// sheet with every other row hidden stays small: at most this many ranges of each kind are kept and
// the rest are counted.
const HIDDEN_RANGES_LISTED = 1000;

const isTrue = (value: string | undefined): boolean => value === '1' || value === 'true';

/** Ascending numbers joined into ranges; a range that would pass the cap is only counted. */
class RangeList {
  private readonly ranges: [number, number][] = [];
  private omitted = 0;
  private lastTo: number | undefined;
  private lastKept = false;

  add(from: number, to: number): void {
    if (this.lastTo !== undefined && from === this.lastTo + 1) {
      const last = this.ranges.at(-1);
      if (this.lastKept && last !== undefined) last[1] = to;
    } else if (this.ranges.length < HIDDEN_RANGES_LISTED) {
      this.ranges.push([from, to]);
      this.lastKept = true;
    } else {
      this.omitted += 1;
      this.lastKept = false;
    }
    this.lastTo = to;
  }

  lines(label: (position: number) => string): HiddenLines {
    const text = ([from, to]: [number, number]): string =>
      from === to ? label(from) : `${label(from)}:${label(to)}`;
    return { ranges: this.ranges.map(text), omitted: this.omitted };
  }
}

function wholeNumber(text: string | undefined): number | undefined {
  return text === undefined ? undefined : parseRowNumber(text);
}

export class HiddenReader implements XmlVisitor {
  private readonly hiddenRows = new RangeList();
  private readonly hiddenColumns = new RangeList();
  private row = 0;

  open(name: string, attributes: Attributes): void {
    if (name === 'row') this.openRow(attributes);
    else if (name === 'col') this.openColumn(attributes);
  }

  private openRow(attributes: Attributes): void {
    const given = attributes['r'];
    this.row = given === undefined ? this.row + 1 : (wholeNumber(given) ?? this.row + 1);
    if (isTrue(attributes['hidden'])) this.hiddenRows.add(this.row, this.row);
  }

  private openColumn(attributes: Attributes): void {
    const min = wholeNumber(attributes['min']);
    const max = wholeNumber(attributes['max']);
    if (!isTrue(attributes['hidden']) || min === undefined || max === undefined) return;
    if (min > max || max > MAX_COLUMNS) return;
    this.hiddenColumns.add(min, max);
  }

  get rows(): HiddenLines {
    return this.hiddenRows.lines(String);
  }

  get columns(): HiddenLines {
    return this.hiddenColumns.lines((position) => columnName(position - 1));
  }
}
