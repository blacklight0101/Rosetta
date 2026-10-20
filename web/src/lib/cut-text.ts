// RF-1002: cutting text for display. A character outside the basic plane (an emoji) is two UTF-16
// units; cutting between them leaves half a character, so the cut moves back before it.

/** The first `max` UTF-16 units of `text`, or one fewer when the cut would split a surrogate pair. */
export function cutText(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  const next = text.charCodeAt(max);
  const splits = last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
  return text.slice(0, splits ? max - 1 : max);
}
