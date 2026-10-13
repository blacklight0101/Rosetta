// RF-141: the key under which two spellings of one path meet, so a private key left open by a read
// of `a.cs` is carried into a read of `A.cs` (see mask-request.ts).

/** The mark a Turkish dotted capital I leaves after lower-casing (`İ` becomes `i` and this mark). */
const COMBINING_DOT_ABOVE = String.fromCharCode(0x307);
const BACKSLASH = String.fromCharCode(0x5c);

/** A path component without the dots and spaces Windows strips from its end (`..` stays). */
function withoutTrailingDots(component: string): string {
  return component.replace(/(?<=[^. ])[. ]+$/, '');
}

/**
 * The file a path names on a file system that is not case-sensitive, may normalise Unicode and
 * may be Windows: the same file can come back as `a.cs` and `A.cs`, with `é` composed and
 * decomposed, with a backslash for a slash, as `a.cs.` (Windows drops trailing dots and spaces)
 * or, with Turkish `İ` for `i`. Folding wider than a file system does (`ß` and `ss` meet) only
 * carries a key further, which is the safe side.
 */
export function fileKey(path: string): string {
  return path
    .replaceAll(BACKSLASH, '/')
    .split('/')
    .map(withoutTrailingDots)
    .join('/')
    .normalize('NFC')
    .toUpperCase()
    .toLowerCase()
    .replaceAll(COMBINING_DOT_ABOVE, '');
}
