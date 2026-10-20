// RF-1016: the name of an area on a tile (stub, replaced by the fix).
export interface AreaLabel {
  readonly text: string;
  readonly full: string;
  readonly part: number | undefined;
}

export function areaLabel(name: string): AreaLabel {
  return { text: name, full: name, part: undefined };
}
