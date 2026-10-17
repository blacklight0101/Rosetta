// RF-141, DEC-57, P2-42: a secret option whose value stands after a shell line continuation
// (`--password \`, then the value on the next line). A paged read (RF-144) or a tool result can end
// on that continuation mark, so the value is the first thing of the next piece of the same file and
// no rule sees the option and the value together. The tail of a piece that ends this way is kept
// and put in front of the next piece of its file while that piece is masked, so the rules read the
// option and the value as one text; the tail is cut off the masked text again. Linear time: only
// the last 512 characters are looked at, and the tail is at most one line of 80 characters.

const lineEnd = String.raw`(?:\r\n|[\n\r\u2028\u2029])`;
const mark = String.raw`[\\^\x60]`;
const tailPattern = new RegExp(
  String.raw`(?<![A-Za-z0-9-])--(?:password|passwd|pwd|token)(?:[^\r\n\u2028\u2029\\^\x60]|${mark}[ \t]*${lineEnd}){0,80}${mark}[ \t]*(?:${lineEnd}[ \t]*)?$`,
  'i',
);
const endsWithLineEnd = new RegExp(`${lineEnd}[ \\t]*$`);
const window = 512;

/**
 * The text to put in front of the next piece of the file when the text ends on the continuation of
 * a secret option, with a line break after the mark; undefined when it does not.
 */
// RF-141
export function continuationTail(text: string): string | undefined {
  const found = tailPattern.exec(text.slice(-window));
  if (found === null) return undefined;
  return endsWithLineEnd.test(found[0]) ? found[0] : `${found[0]}\n`;
}
