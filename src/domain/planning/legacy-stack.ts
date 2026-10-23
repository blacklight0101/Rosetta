import type { CodeMap } from '../code-map/code-map.js';
import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { ArtefactKind } from '../code-map/artefact.js';

// RF-609, DEC-78: what the scan found of the legacy stack, so that the options for each layer are
// pre-filled from the code and not from what a model remembers: the languages by lines, the
// language packs that read the code, the files that name a technology or a version, and the areas.
// Every list is in a fixed order and bounded.

const MAX_MARKERS = 40;
const MAX_AREAS = 40;
const MARKER_KINDS = ['configuration', 'database-script', 'manifest', 'deployment'] as const;

type MarkerKind = Extract<ArtefactKind, (typeof MARKER_KINDS)[number]>;

interface LegacyLanguage {
  readonly language: string;
  readonly files: number;
  readonly lines: number;
}

interface LegacyMarker {
  readonly path: string;
  readonly kind: MarkerKind;
}

export interface LegacyStack {
  /** By lines, most first; a file that was skipped or has an unknown language is not counted. */
  readonly languages: readonly LegacyLanguage[];
  readonly packs: readonly string[];
  /** By path; at most 40. */
  readonly markers: readonly LegacyMarker[];
  /** Area names, at most 40. */
  readonly areas: readonly string[];
}

function markerKindOf(kinds: readonly ArtefactKind[]): MarkerKind | undefined {
  return MARKER_KINDS.find((kind) => kinds.includes(kind));
}

function languagesOf(map: CodeMap): LegacyLanguage[] {
  const totals = new Map<string, { files: number; lines: number }>();
  for (const file of map.files) {
    if (file.skipped !== undefined || file.language === 'unknown') continue;
    const total = totals.get(file.language) ?? { files: 0, lines: 0 };
    totals.set(file.language, { files: total.files + 1, lines: total.lines + file.lines });
  }
  return [...totals]
    .map(([language, total]) => ({ language, ...total }))
    .sort((a, b) => b.lines - a.lines || byCodeUnit(a.language, b.language));
}

function markersOf(map: CodeMap): LegacyMarker[] {
  const markers: LegacyMarker[] = [];
  for (const file of map.files) {
    const kind = markerKindOf(file.artefactKinds);
    if (kind !== undefined) markers.push({ path: file.path, kind });
  }
  return markers.sort((a, b) => byCodeUnit(a.path, b.path)).slice(0, MAX_MARKERS);
}

/** The legacy stack the scan found in a code map. */
// RF-609
export function legacyStackOf(map: CodeMap): LegacyStack {
  return {
    languages: languagesOf(map),
    packs: map.languagePacks.map((pack) => pack.name).sort(byCodeUnit),
    markers: markersOf(map),
    areas: map.areas.map((area) => area.name).slice(0, MAX_AREAS),
  };
}
