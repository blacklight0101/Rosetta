import type { CodeMap } from '../code-map/code-map.js';
import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { ApplicationKind } from './planning-brief.js';
import type { KindSignal } from './stack-data.js';

// P5-39, DEC-172, RF-609, ADR-013: what the scan says the legacy application is. The signals are catalogue
// data (`stack-proposals.v<n>.yaml`), so no technology is named here. The paths are repository
// content (untrusted): they are only compared, never run, and every list is bounded.

const TOP_LANGUAGES = 3;
const MAX_EXAMPLES = 3;

/** What the plan reads of the code map to propose a stack and to check the migration strategy. */
export interface LegacyFacts {
  /** The kind the signals found; undefined when no file matched a signal. */
  readonly detected?: { readonly kind: ApplicationKind; readonly examples: readonly string[] };
  /** The three languages with most lines. */
  readonly languages: readonly string[];
  /** Every file extension of the code map, lower case, without the dot, sorted. */
  readonly extensions: readonly string[];
  /** Whether the code reaches a database: a SQL statement or a SQL script. */
  readonly database: boolean;
}

type Mapped = Pick<CodeMap, 'files' | 'sqlStatements'>;

function matches(signal: KindSignal, file: CodeMap['files'][number]): boolean {
  const name = file.path.slice(file.path.lastIndexOf('/') + 1).toLowerCase();
  const dot = name.lastIndexOf('.');
  const extension = dot < 0 ? '' : name.slice(dot + 1);
  return (
    file.artefactKinds.some((kind) => signal.artefacts.includes(kind)) ||
    signal.extensions.includes(extension) ||
    signal.suffixes.some((suffix) => name.endsWith(suffix))
  );
}

function extensionsOf(map: Mapped): string[] {
  const found = new Set<string>();
  for (const file of map.files) {
    const name = file.path.slice(file.path.lastIndexOf('/') + 1).toLowerCase();
    const dot = name.lastIndexOf('.');
    if (dot >= 0) found.add(name.slice(dot + 1));
  }
  return [...found].sort(byCodeUnit);
}

function languagesOf(map: Mapped): string[] {
  const lines = new Map<string, number>();
  for (const file of map.files) {
    if (file.skipped !== undefined || file.language === 'unknown') continue;
    lines.set(file.language, (lines.get(file.language) ?? 0) + file.lines);
  }
  return [...lines]
    .sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))
    .slice(0, TOP_LANGUAGES)
    .map(([language]) => language);
}

/** The facts of a code map; the first signal group with a matching file decides the kind. */
// RF-609
export function legacyFactsOf(map: Mapped, signals: readonly KindSignal[]): LegacyFacts {
  const database =
    map.sqlStatements.length > 0 ||
    map.files.some((file) => file.artefactKinds.includes('database-script'));
  const languages = languagesOf(map);
  const extensions = extensionsOf(map);
  for (const signal of signals) {
    const found = map.files.filter((file) => matches(signal, file)).map((file) => file.path);
    if (found.length > 0) {
      const examples = found.sort(byCodeUnit).slice(0, MAX_EXAMPLES);
      return { detected: { kind: signal.kind, examples }, languages, extensions, database };
    }
  }
  return { languages, extensions, database };
}
