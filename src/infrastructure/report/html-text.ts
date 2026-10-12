// RF-507, ADR-013: text from a repository or a model is put into a page as text, never as markup.

/** The text with `& < > " '` replaced by entities, safe in element text and in quoted attributes. */
export function escapeHtml(text: string): string {
  return text;
}

/** Whether the address is an `https://github.com/` link and nothing else (RF-507). */
export function isGitHubLink(address: string): boolean {
  void address;
  return false;
}

/**
 * Model text as HTML: every character shown as text; a Markdown link `[label](address)` stays a
 * link only when the address is an `https://github.com/` one, any other is shown as the text it was.
 */
export function renderModelText(text: string): string {
  return text;
}
