// RF-507, RF-1200: text placed in an HTML page is escaped, never inserted as markup. The landing page
// is the only page the server writes itself; its one dynamic value is the contact address.

const entities: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** The text with `& < > " '` replaced by entities, safe in element text and in quoted attributes. */
// RF-507
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}
