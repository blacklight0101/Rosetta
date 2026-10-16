// RF-1018, P1-172: what the area picker of the start page works out of the list of areas: which
// ones the filter keeps, how the folded line of library areas reads, and the sums of the bar.

export interface AreaChoice {
  readonly name: string;
  readonly estimatedTokens: number | undefined;
  readonly files: number;
  /** Only vendored or minified files (RF-1001): left out of the list and unticked by default. */
  readonly thirdParty: boolean;
  readonly checked: boolean;
}

/** Why an area is left out of the list: the scan found only vendored or minified files in it. */
export const LIBRARY_REASON = 'Only vendored or minified files';

const NAMES_IN_LINE = 3;

export const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;

/** The filter keeps an area whose name holds the typed text, in any case. */
export function matchesFilter(area: AreaChoice, filter: string): boolean {
  return area.name.toLowerCase().includes(filter.trim().toLowerCase());
}

/** "12 library areas left out: A, B, C and 9 more" */
export function libraryLine(library: readonly AreaChoice[]): string {
  const named = library.slice(0, NAMES_IN_LINE).map((area) => area.name);
  const rest = library.length - named.length;
  const names = rest > 0 ? `${named.join(', ')} and ${String(rest)} more` : named.join(', ');
  return `${plural(library.length, 'library area')} left out: ${names}`;
}

export interface Chosen {
  readonly areas: number;
  readonly files: number;
  readonly libraryAreas: number;
  readonly libraryTokens: number;
}

export function chosenOf(areas: readonly AreaChoice[]): Chosen {
  const checked = areas.filter((area) => area.checked);
  const library = checked.filter((area) => area.thirdParty);
  return {
    areas: checked.length,
    files: checked.reduce((sum, area) => sum + area.files, 0),
    libraryAreas: library.length,
    libraryTokens: library.reduce((sum, area) => sum + (area.estimatedTokens ?? 0), 0),
  };
}
