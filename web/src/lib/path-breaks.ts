// RNF-010, design-system.md section 10: where a long path may wrap. A path breaks after each "/"
// and before the ":" of a line range, never inside a name (`overflow-wrap: anywhere` would cut
// "dependencies" in two). The pieces joined are the text again, so nothing is lost or added.

const breakPoints = /(?<=\/)(?=\S)|(?<=\S)(?=:\d)/u;

// RNF-010
export function breakablePieces(text: string): readonly string[] {
  return text.split(breakPoints);
}
