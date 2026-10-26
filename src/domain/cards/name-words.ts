// P3-122, P5-31: a name compared as words. Case, underscores, hyphens, spaces and camelCase do not
// matter: `Asset Tag`, `asset_tag` and `txtAssetTag` all hold the words of `AssetTag`.

/** The lower-case words of a text: split at camelCase humps and at every non-alphanumeric run. */
export function wordsOf(text: string): readonly string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

/** True when `needle` is a whole run of words inside `haystack`. */
export function containsRun(haystack: readonly string[], needle: readonly string[]): boolean {
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
  }
  return false;
}

/** True when the words of `wanted` are a whole run inside the words of `name`. */
export function nameHolds(name: string, wanted: string): boolean {
  const needle = wordsOf(wanted);
  return needle.length > 0 && containsRun(wordsOf(name), needle);
}
