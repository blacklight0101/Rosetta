// RF-153, Q-38: the file name of an external link target and nothing else. The target is
// percent-decoded until nothing changes (at most MAX_ROUNDS times, a stray `%` or a bad escape left
// as it is), so an escape written with escaped digits (`%25%33F`) or escaped at any depth shows
// itself; then the query, the fragment and the path parameters are cut, and so are the folder, the
// host and the user information. A name that still holds an escape after the bound, or an `@`, is
// not kept. Each round is linear, and the rounds are bounded, so the cost is linear in the target.
// A file name that holds `;` or `@` is not kept whole: that is rare, and keeping a token is worse.

const MAX_ROUNDS = 32;
const ESCAPES = /(?:%[0-9a-f]{2})+/giu;
const HAS_ESCAPE = /%[0-9a-f]{2}/iu;
const QUERY_OR_FRAGMENT = /[?#]/u;
const SEPARATOR = /[\\/]/u;
/** A URL with a host and no path: `https://user:pass@host`, whose last segment is not a file name. */
const HOST_ONLY = /^[a-z][a-z0-9+.-]*:\/\/[^\\/]*$/iu;

function decodeRun(run: string): string {
  try {
    return decodeURIComponent(run);
  } catch {
    return run;
  }
}

/** The target with every escape that can be decoded decoded, to a fixed point or the bound. */
function fullyDecoded(target: string): string {
  let text = target;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const next = text.replace(ESCAPES, decodeRun);
    if (next === text) break;
    text = next;
  }
  return text;
}

/** The file name a link target names; empty when it names none or cannot be shown safely. */
export function linkFileName(target: string): string {
  const decoded = fullyDecoded(target);
  const cut = QUERY_OR_FRAGMENT.exec(decoded);
  const bare = cut === null ? decoded : decoded.slice(0, cut.index);
  if (HOST_ONLY.test(bare)) return '';
  const last = bare.split(SEPARATOR).pop() ?? '';
  const name = last.split(';')[0] ?? '';
  return HAS_ESCAPE.test(name) || name.includes('@') ? '' : name;
}
