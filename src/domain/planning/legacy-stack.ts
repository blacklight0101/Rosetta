import type { CodeMap } from '../code-map/code-map.js';

// RF-609, DEC-78: what the scan found of the legacy stack. Stub until the feature commit.

export interface LegacyLanguage {
  readonly language: string;
  readonly files: number;
  readonly lines: number;
}

export interface LegacyMarker {
  readonly path: string;
  readonly kind: 'configuration' | 'database-script' | 'manifest';
}

export interface LegacyStack {
  readonly languages: readonly LegacyLanguage[];
  readonly packs: readonly string[];
  readonly markers: readonly LegacyMarker[];
  readonly areas: readonly string[];
}

export function legacyStackOf(map: CodeMap): LegacyStack {
  return { languages: [], packs: [], markers: [], areas: map.areas.length < 0 ? ['x'] : [] };
}
