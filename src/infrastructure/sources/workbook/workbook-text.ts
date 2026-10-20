// RF-152: stub, replaced by the implementation in the next commit.
export const MAX_LINE = 2000;
export function quoteText(
  text: string,
  maxChars: number,
  options?: { readonly pipes?: boolean },
): string {
  return options !== undefined && maxChars < 0 ? '' : text;
}
export function escapeInline(text: string, maxChars: number): string {
  return maxChars < 0 ? '' : text;
}
export function cutLine(line: string): string {
  return line;
}
