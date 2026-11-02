// RF-243, P8-08, EV-09: three more kinds of question the cited lines answer, by the same rule as
// `nameAnsweredByCitedLines` (narrow and deterministic, no model call). A wrongly dropped question
// is worse than a duplicate, so each kind drops a question only when the cited lines hold the
// answer to THAT question, and keeps it when in doubt:
//   - the connection string: the question names no other environment or database, and exactly one
//     cited line sets a connection string to a literal value (never a call or a variable);
//   - the publish parameters: the question names no destination, and a cited line sets a publish
//     parameter to a value (`dotnet publish` alone is a command, not its parameters);
//   - the upload's own source: the question names what source it means (a macro, a module) and the
//     cited lines declare it; a question about the whole workbook, or about a module the cited
//     lines do not declare, stands.
// A line with `?` and a TODO or FIXME line never count, and a question about a condition, a
// reason, people, a production value or a secret stands.

interface Kind {
  readonly asks: RegExp;
  readonly defines: RegExp;
  /** Words that name another thing than the one the lines hold. */
  readonly other: RegExp;
  readonly name: string;
}

const environments =
  /\b(?:staging|stage|backup|test|testing|dev|development|qa|uat|replica|secondary|reporting|legacy|old|new|other|another|second|read-only|readonly|customer|client|azure|aws|iis|ftp)\b/u;

const connection: Kind = {
  asks: /^(?:what|which)\b.*\bconnection strings?\b/u,
  // the value is a literal: a quoted server or data source with a database, never a call
  defines:
    /\bconnection\s?strings?\b\s*["']?\s*[=:]\s*["'][^"']*\b(?:server|data source|host)\s*=[^"']*["']|\bconnection\s?strings?\s*=\s*"[^"]*(?:server|data source)\s*=/iu,
  other: environments,
  name: 'connection string',
};

const publish: Kind = {
  asks: /^(?:what|which)\b.*\bpublish(?:ing)?\s+(?:parameters?|settings?|options?|profile)\b|^(?:what|which)\b.*\bparameters?\b.*\bto publish\b/u,
  defines:
    /(?:publishprofile|publishurl|webpublishmethod|msdeployserviceurl|deployonbuild)\s*[=:>]\s*[^\s<]+|<(?:publishurl|webpublishmethod|msdeployserviceurl)>[^<]+</iu,
  other:
    /\b(?:staging|stage|backup|test|testing|dev|development|qa|uat|replica|secondary|legacy|old|new|other|another|second|customer|client|azure|aws|iis|ftp|server|target|destination|host|machine|site|environment|folder)\b/u,
  name: 'publish parameters',
};

const sourceAsk =
  /^(?:what|where|which|is|are|can|could|does|do)\b.*\b(?:vba|macro)?\s*source(?: code)?\b.*\b(?:provided|available|included|missing|upload|uploaded|shared|located|where|what is|what are)\b|^(?:what|where|which)\b.*\b(?:vba|macro) source(?: code)?\b/u;
const procedure = /^\s*(?:(?:public|private|friend|static)\s+)*(?:sub|function)\s+([A-Za-z_]\w*)/iu;
const moduleName = /^\s*attribute\s+vb_name\s*=\s*"(\w+)"/iu;

/** Words that make the question about something other than the thing itself. */
const stands =
  /\b(?:why|reasons?|when|whenever|if|whether|unless|should|who|users?|production|prod|live|secrets?|passwords?|credentials?|keys?|tokens?|external|third party|vendor|partner|per environment|each environment|different)\b/u;

/** A question about the source as a whole is not answered by some of its procedures. */
const wholeSource = /\b(?:workbook|whole|entire|all|every|everything|complete|file|files)\b/u;

/** Words of a source question that do not say which source it means. */
const generic = new Set(
  `a an the of in on for to is are was be it its this that and or macro macros module modules sub subs
   function functions vba source code upload uploaded included provided available missing shared
   located where what which does do can could`.split(/\s+/u),
);

const lines = (cited: string): readonly string[] =>
  cited.split(/\r?\n/u).filter((line) => !line.includes('?') && !/\b(?:TODO|FIXME)\b/iu.test(line));

function wordsOf(text: string): readonly string[] {
  return text
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== '');
}

/** The procedure names the lines declare, else the module names. */
function declared(cited: string): readonly string[] {
  const held = lines(cited);
  const all = (pattern: RegExp): string[] => held.flatMap((line) => pattern.exec(line)?.[1] ?? []);
  const procedures = all(procedure);
  return procedures.length > 0 ? procedures : all(moduleName);
}

function sourceName(question: string, cited: string): string | undefined {
  if (wholeSource.test(question)) return undefined;
  const names = declared(cited);
  const known = new Set(
    [...names, ...lines(cited).flatMap((line) => moduleName.exec(line)?.[1] ?? [])].flatMap(
      wordsOf,
    ),
  );
  const meant = wordsOf(question).filter((word) => !generic.has(word));
  // the question must say which source it means, and the lines must declare it
  if (
    meant.length === 0 ||
    !meant.every((word) => known.has(word.replace(/s$/u, '')) || known.has(word))
  )
    return undefined;
  return names[0];
}

function kindName(kind: Kind, lower: string, cited: string): string | undefined {
  if (!kind.asks.test(lower) || kind.other.test(lower)) return undefined;
  const held = lines(cited).filter((line) => kind.defines.test(line));
  const clear = held.length === 1 && !kind.other.test((held[0] ?? '').toLowerCase());
  return clear ? kind.name : undefined;
}

/** The thing the cited lines hold that the question asks for, or undefined when the question stands. */
// RF-243
export function kindAnsweredByCitedLines(question: string, cited: string): string | undefined {
  const lower = question.toLowerCase().replace(/\s+/gu, ' ').trim();
  if (stands.test(lower)) return undefined;
  const found = kindName(connection, lower, cited) ?? kindName(publish, lower, cited);
  if (found !== undefined) return found;
  return sourceAsk.test(lower) ? sourceName(lower, cited) : undefined;
}
