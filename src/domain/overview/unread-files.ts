// RF-264 (Q-53), RF-231: the line of "What was not covered" about first-party files no task read. It is
// the one place that words it; the run page, `overview.md` and the report all show the sentence the
// overview holds. The facts are the measures the run already computes (RF-231): the files not read,
// largest first, and the first-party tokens in the run's areas and read. Never "complete".

/** The first-party files no task read, with the token totals the share is worked out from. */
export interface UnreadFiles {
  /** Largest first. */
  readonly files: readonly {
    readonly path: string;
    /** The tokens not read: all of an unread file, the rest of a partly read one. */
    readonly tokens: number;
    /** EV-04: the share 0..1 of a partly read file not read; absent for a file no task read. */
    readonly unreadShare?: number;
  }[];
  readonly firstPartyTokens: number;
  readonly firstPartyReadTokens: number;
}

/** What the line starts with; the web page sets it apart by the same words (group-not-covered.ts). */
const UNREAD_FILES_PREFIX = 'First-party files not read: ';

const LARGEST_SHOWN = 5;
const number = new Intl.NumberFormat('en-US');

function plural(count: number, word: string): string {
  return `${number.format(count)} ${word}${count === 1 ? '' : 's'}`;
}

/** The share of first-party tokens not read in whole percent, cut down; above zero is never 0%. */
function shareText(unread: UnreadFiles): string | undefined {
  const { firstPartyTokens, firstPartyReadTokens } = unread;
  if (firstPartyTokens <= 0) return undefined;
  const notRead = Math.max(0, firstPartyTokens - firstPartyReadTokens);
  const whole = Math.floor((notRead * 100) / firstPartyTokens);
  return whole === 0 && notRead > 0 ? 'less than 1%' : `${String(whole)}%`;
}

/** `overview.json` refuses a line over 1000 characters (and so loses the overview); stay well under. */
const MAX_LINE = 900;
/** The tail of a path kept when the line would be too long: the file name and its nearest folders. */
const SHORT_PATH = 80;

function shortened(path: string): string {
  return path.length <= SHORT_PATH ? path : `...${path.slice(path.length - SHORT_PATH + 3)}`;
}

/** EV-04: a partly read file says how much of it is left, so it is not taken for a file no task read. */
function sizeText(file: UnreadFiles['files'][number]): string {
  if (file.unreadShare === undefined) return plural(file.tokens, 'token');
  const share = (file.unreadShare * 100).toFixed(1);
  return `${plural(file.tokens, 'token')} unread, ${share}% of the file`;
}

function largestText(unread: UnreadFiles, pathOf: (path: string) => string): string {
  const shown = unread.files
    .slice(0, LARGEST_SHOWN)
    .map((file) => `${pathOf(file.path)} (${sizeText(file)})`);
  const more = unread.files.length - shown.length;
  return `Largest: ${shown.join(', ')}${more > 0 ? `, and ${number.format(more)} more` : ''}.`;
}

// RF-264
export function unreadFilesLine(unread: UnreadFiles): string | undefined {
  const count = unread.files.length;
  if (count === 0) return undefined;
  const share = shareText(unread);
  const figures =
    share === undefined
      ? plural(count, 'file')
      : `${plural(count, 'file')}, ${share} of first-party tokens not read`;
  const next = `Next step: run a Deepen to read ${count === 1 ? 'it' : 'them'}.`;
  const line = (pathOf: (path: string) => string): string =>
    `${UNREAD_FILES_PREFIX}${figures}. ${largestText(unread, pathOf)} ${next}`;
  const full = line((path) => path);
  return full.length <= MAX_LINE ? full : line(shortened);
}
