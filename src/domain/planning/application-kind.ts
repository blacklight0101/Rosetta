import type { CodeMap } from '../code-map/code-map.js';
import type { ApplicationKind } from './planning-brief.js';
import type { KindSignal } from './stack-data.js';

// P5-39, RF-609: what the scan says the legacy application is. Type-only stub for the tests that
// come first; the next commit implements it.

export interface LegacyFacts {
  readonly detected?: { readonly kind: ApplicationKind; readonly examples: readonly string[] };
  readonly languages: readonly string[];
  readonly database: boolean;
}

type Mapped = Pick<CodeMap, 'files' | 'sqlStatements'>;

// RF-609
export function legacyFactsOf(map: Mapped, signals: readonly KindSignal[]): LegacyFacts {
  return { languages: [], database: map.files.length < 0 && signals.length < 0 };
}
