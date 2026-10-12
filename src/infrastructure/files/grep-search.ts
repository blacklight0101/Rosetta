// RF-146: the search the grep worker runs. Self-contained (no imports) so the worker can load it
// from source or from the build.

export interface SearchInput {
  readonly pattern: string;
  readonly files: readonly { readonly path: string; readonly lines: readonly string[] }[];
  /** When given, the search stops one match past it, so the caller can tell it cut the list. */
  readonly maxMatches?: number | undefined;
}

export type SearchOutcome =
  | {
      readonly kind: 'matches';
      readonly matches: readonly { readonly path: string; readonly line: number }[];
    }
  | { readonly kind: 'invalid-pattern'; readonly detail: string };

export function searchFiles(input: SearchInput): SearchOutcome {
  let expression: RegExp;
  try {
    expression = new RegExp(input.pattern);
  } catch (error: unknown) {
    return { kind: 'invalid-pattern', detail: error instanceof Error ? error.message : '' };
  }
  return { kind: 'matches', matches: matching(expression, input) };
}

function matching(expression: RegExp, input: SearchInput): { path: string; line: number }[] {
  const stopAt = (input.maxMatches ?? Number.POSITIVE_INFINITY) + 1;
  const matches: { path: string; line: number }[] = [];
  for (const file of input.files) {
    for (const [index, text] of file.lines.entries()) {
      if (expression.test(text)) matches.push({ path: file.path, line: index + 1 });
      if (matches.length >= stopAt) return matches;
    }
  }
  return matches;
}
