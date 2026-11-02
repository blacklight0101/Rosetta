// RF-243, P8-08, EV-09: three kinds of open question the cited lines may hold the answer to: the
// connection string, the publish parameters and the upload's own source. A word list cannot tell
// whether the lines answer THIS question, so these questions are never dropped. When a cited line
// holds a plain literal for what the question asks, it is offered as a suggested answer with its
// file and line, and the owner confirms it with one click. A value that is built (a call, a
// concatenation, a variable, a placeholder, a secret) gets no suggestion.

interface Kind {
  readonly asks: RegExp;
  /** Matches the line and captures the plain literal value in group 1. */
  readonly holds: RegExp;
  readonly what: string;
  /** Whether the captured value holds nothing but plain, safe content. */
  readonly safe: (value: string) => boolean;
}

/** A value that is built or a placeholder, never a plain literal. */
const notPlain =
  /[&+$%<>{}()[\]@]|\b(?:your|my|changeme|change_me|placeholder|example|xxx+|todo|tbd|null|nothing|empty)\w*\b/iu;

/** The keys of a connection string that hold no secret; any other key means no suggestion. */
const safeKeys = new Set(
  `server|data source|host|address|addr|network address|port|database|initial catalog
   |integrated security|trusted_connection|encrypt|trustservercertificate|multipleactiveresultsets
   |connect timeout|connection timeout|application name|provider|driver|persist security info
   |user id|uid|user`
    .split('|')
    .map((key) => key.trim()),
);

/** True when every key of the connection string is a safe one (Persist Security Info only false). */
function onlySafeKeys(value: string): boolean {
  const parts = value.split(';').filter((part) => part.trim() !== '');
  return (
    parts.length > 0 &&
    parts.every((part) => {
      const at = part.indexOf('=');
      if (at < 0) return false;
      const key = part.slice(0, at).trim().toLowerCase();
      const held = part
        .slice(at + 1)
        .trim()
        .toLowerCase();
      return safeKeys.has(key) && (key !== 'persist security info' || held === 'false');
    })
  );
}

/** A publish value is a plain word, path or URL without user information. */
const plainValue = /^[\w./\\:-]+$/u;

const connection: Kind = {
  asks: /^(?:what|which)\b.*\bconnection strings?\b/u,
  holds:
    /\bconnection\s?strings?\b["']?\s*[=:]\s*"([^"]*\b(?:server|data source|host)\s*=[^"]*)"(?!\s*[&+])/iu,
  what: 'connection string',
  safe: onlySafeKeys,
};

const publish: Kind = {
  asks: /^(?:what|which)\b.*\bpublish(?:ing)?\s+(?:parameters?|settings?|options?|profile)\b|^(?:what|which)\b.*\bparameters?\b.*\bto publish\b/u,
  holds:
    /\b(?:publishprofile|publishurl|webpublishmethod|msdeployserviceurl)\s*[=:]\s*"?([^\s"'<>;,]+)/iu,
  what: 'publish parameter',
  safe: (value) => plainValue.test(value),
};

const sourceAsk =
  /^(?:what|where|which|is|are|can|could|does|do)\b.*\b(?:vba|macro)?\s*source(?: code)?\b.*\b(?:provided|available|included|missing|upload|uploaded|shared|located|where|what is|what are)\b|^(?:what|where|which)\b.*\b(?:vba|macro) source(?: code)?\b/u;
const procedure = /^\s*(?:(?:public|private|friend|static)\s+)*(?:sub|function)\s+([A-Za-z_]\w*)/iu;

/** Words that make the question about something other than the thing itself. */
const stands =
  /\b(?:why|reasons?|when|whenever|if|whether|unless|should|who|users?|production|prod|live|secrets?|passwords?|credentials?|keys?|tokens?|external|third party|vendor|partner|per environment|each environment|different)\b/u;

/** Words of a source question that do not say which source it means. */
const generic = new Set(
  `a an the of in on for to is are was be it its this that and or macro macros module modules sub subs
   function functions vba source code upload uploaded included provided available missing shared
   located where what which does do can could workbook`.split(/\s+/u),
);

/** A cited line and where it stands. */
export interface CitedLine {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

/** What the cited lines offer as a suggested answer to an open question. */
export interface SourceSuggestion {
  readonly answer: string;
  readonly description: string;
  readonly path: string;
  readonly line: number;
}

const usable = (line: CitedLine): boolean =>
  !line.text.includes('?') && !/\b(?:TODO|FIXME)\b/iu.test(line.text);

function wordsOf(text: string): readonly string[] {
  return text
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== '');
}

function literalOf(kind: Kind, cited: readonly CitedLine[]): SourceSuggestion | undefined {
  const found = cited.filter(usable).flatMap((line) => {
    const value = kind.holds.exec(line.text)?.[1]?.trim();
    return value === undefined || value === '' ? [] : [{ line, value }];
  });
  const only = found.length === 1 ? found[0] : undefined;
  if (only === undefined || notPlain.test(only.value) || !kind.safe(only.value)) return undefined;
  const { line, value } = only;
  return {
    ...{ answer: value, path: line.path, line: line.line },
    description: `The cited line ${line.path}:${String(line.line)} sets this ${kind.what}.`,
  };
}

function sourceOf(lower: string, cited: readonly CitedLine[]): SourceSuggestion | undefined {
  const declared = cited.filter(usable).flatMap((line) => {
    const name = procedure.exec(line.text)?.[1];
    return name === undefined ? [] : [{ line, name }];
  });
  const known = new Set(declared.flatMap(({ name }) => wordsOf(name)));
  const meant = wordsOf(lower).filter((word) => !generic.has(word));
  const first = declared[0];
  if (first === undefined || meant.length === 0 || !meant.every((word) => known.has(word)))
    return undefined;
  return {
    answer: `It is in the upload: ${first.name}`,
    description: `The cited line ${first.line.path}:${String(first.line.line)} declares ${first.name}.`,
    path: first.line.path,
    line: first.line.line,
  };
}

/** The line that holds a plain literal answer to the question, or undefined (the question gets none). */
// RF-243
export function suggestionFromCitedLines(
  question: string,
  cited: readonly CitedLine[],
): SourceSuggestion | undefined {
  const lower = question.toLowerCase().replace(/\s+/gu, ' ').trim();
  if (stands.test(lower)) return undefined;
  for (const kind of [connection, publish]) {
    if (kind.asks.test(lower)) return literalOf(kind, cited);
  }
  return sourceAsk.test(lower) ? sourceOf(lower, cited) : undefined;
}
