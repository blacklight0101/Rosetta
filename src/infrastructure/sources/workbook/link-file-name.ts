// RF-153, Q-38: the file name of an external link target and nothing else. The folder, the host,
// the user information, the query and the fragment are cut, whether they are written plainly or
// percent-encoded at any depth (`%3F`, `%253F`, `%25253F`...). The cuts are made on the text with
// patterns that accept any number of `25` prefixes, so the cost is linear in the length of the target.

/** `?` or `#`, plain or encoded at any depth: everything from here on is never kept. */
const QUERY_OR_FRAGMENT = /[?#]|%(?:25)*(?:3f|23)/iu;
/** A backslash or a slash, plain or encoded at any depth. */
const SEPARATOR = /[\\/]|%(?:25)*(?:2f|5c)/iu;
/** A URL with a host and no path: `https://user:pass@host`, whose last segment is not a file name. */
const HOST_ONLY = /^[a-z][a-z0-9+.-]*:\/\/[^\\/]*$/iu;

/** The file name a link target names, decoded once; empty when it names none. */
export function linkFileName(target: string): string {
  const cut = QUERY_OR_FRAGMENT.exec(target);
  const bare = cut === null ? target : target.slice(0, cut.index);
  if (HOST_ONLY.test(bare)) return '';
  const name = bare.split(SEPARATOR).pop() ?? '';
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
