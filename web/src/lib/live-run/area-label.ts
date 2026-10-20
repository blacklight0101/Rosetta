// RF-1016, RF-104, data-model.md section 3.1: the name of an area on a tile of the code map. Only the
// part after the last "/" is shown, because the folder or workbook before it is the same on most
// tiles. The `#1` that ends the name of a part of an area that was too large for one agent (the
// scan cuts it into `<name>#1`, `<name>#2`) reads "part 1". The full name stays for the hover, the
// focus and the screen reader.

export interface AreaLabel {
  readonly text: string;
  readonly full: string;
  /** The number of the part of a large area, if the name ends in `#<number>`. */
  readonly part: number | undefined;
}

const partSuffix = /#(\d+)$/u;

// RF-1016
export function areaLabel(name: string): AreaLabel {
  const last =
    name
      .split('/')
      .filter((segment) => segment !== '')
      .at(-1) ?? name;
  const match = partSuffix.exec(last);
  if (match === null) return { text: last, full: name, part: undefined };
  const base = last.slice(0, match.index);
  const part = Number(match[1]);
  return { text: base === '' ? last : `${base}, part ${String(part)}`, full: name, part };
}
