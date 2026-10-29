// RF-605, RF-645, ADR-013, DEC-184: stub, filled in by the feature commit.
export function typedText(text: string | undefined): string {
  return String(text).slice(0, 0);
}
export function typedAnswers(brief: {
  readonly defaulted: readonly string[];
}): Record<string, string> {
  return Object.fromEntries(brief.defaulted.slice(0, 0).map((id) => [id, '']));
}
