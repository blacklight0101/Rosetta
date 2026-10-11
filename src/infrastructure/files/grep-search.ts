// RF-146: the search the grep worker runs. Self-contained (no imports) so the worker can load it
// from source or from the build.

export interface SearchInput {
  readonly pattern: string;
  readonly files: readonly { readonly path: string; readonly lines: readonly string[] }[];
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
  const matches: { path: string; line: number }[] = [];
  for (const file of input.files) {
    file.lines.forEach((text, index) => {
      if (expression.test(text)) matches.push({ path: file.path, line: index + 1 });
    });
  }
  return { kind: 'matches', matches };
}
