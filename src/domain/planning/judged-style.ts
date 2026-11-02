import type { ArchitectureStyleId } from './catalogue.js';
import { typedAnswers } from './typed-answers.js';

// EV-73, RF-608, DEC-184: the style the components are judged against. With the owner's own answer
// the brief's style is only the default; when the typed text names a catalogue style the check uses
// that style, else the style Rosetta recommended, and only then the default.

interface JudgedSource {
  readonly architecture: {
    readonly style: ArchitectureStyleId;
    readonly recommended: readonly ArchitectureStyleId[];
  };
  readonly defaulted: readonly string[];
  readonly typed?: Readonly<Record<string, string>> | undefined;
}

/** The styles of the catalogue with the title the owner is likely to type. */
export interface NamedStyle {
  readonly id: ArchitectureStyleId;
  readonly title: string;
}

/** The title without a parenthesis: "Layered (N-tier)" is typed as "layered". */
function shortTitle(title: string): string {
  return title.replace(/\s*\(.*\)\s*$/u, '').toLowerCase();
}

/** The style the dependency check and the component roles follow. */
export function judgedStyleId(
  brief: JudgedSource,
  styles: readonly NamedStyle[],
): ArchitectureStyleId {
  const own = typedAnswers(brief).architecture;
  if (own === undefined) return brief.architecture.style;
  const text = own.toLowerCase();
  const named = [...styles]
    .sort((a, b) => shortTitle(b.title).length - shortTitle(a.title).length)
    .find((style) => text.includes(shortTitle(style.title)) || text.includes(style.id));
  return named?.id ?? brief.architecture.recommended[0] ?? brief.architecture.style;
}
