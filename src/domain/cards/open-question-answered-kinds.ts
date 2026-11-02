// RF-243, P8-08, EV-09: three more kinds of question the cited lines answer, by the same rule as
// `nameAnsweredByCitedLines` (narrow and deterministic, no model call; a refused question is a lost
// owner question):
//   - the connection string: the question asks for it and a cited line sets one;
//   - the publish parameters: the question asks for them and a cited line holds a publish setting
//     or a publish command;
//   - the upload's own source: the question asks where or what the VBA or macro source is, or
//     whether it is in the upload, and the cited lines are that source (a Sub, a Function or a
//     module name).
// A bare mention, a line with `?` and a TODO or FIXME line never count, and a question about a
// condition, a reason, people, a production value or a secret stands.

interface Kind {
  readonly asks: RegExp;
  readonly defines: RegExp;
  /** The name logged; absent when the line names it (the procedure of a source). */
  readonly name?: string;
}

const connection: Kind = {
  asks: /^(?:what|which)\b.*\bconnection strings?\b/u,
  defines:
    /\bconnection\s?strings?\b\s*[=:"]|\b(?:server|data source)\s*=[^;]+;.*\b(?:database|initial catalog)\s*=/iu,
  name: 'connection string',
};

const publish: Kind = {
  asks: /^(?:what|which)\b.*\bpublish(?:ing)?\s+(?:parameters?|settings?|options?|profile)\b|^(?:what|which)\b.*\bparameters?\b.*\bto publish\b/u,
  defines:
    /\b(?:dotnet publish|msdeploy|webpublishmethod|publishprofile|publishurl|deployonbuild)\b|<publish\w*>/iu,
  name: 'publish parameters',
};

const sourceAsk =
  /^(?:what|where|which|is|are|can|could|does|do)\b.*\b(?:vba|macro)?\s*source(?: code)?\b.*\b(?:provided|available|included|missing|upload|uploaded|shared|located|where|what is|what are)\b|^(?:what|where|which)\b.*\b(?:vba|macro) source(?: code)?\b/u;
const procedure = /^\s*(?:(?:public|private|friend|static)\s+)*(?:sub|function)\s+([A-Za-z_]\w*)/iu;
const moduleName = /^\s*attribute\s+vb_name\s*=\s*"(\w+)"/iu;

/** Words that make the question about something other than the thing itself. */
const stands =
  /\b(?:why|reasons?|when|whenever|if|whether|unless|should|who|users?|production|prod|live|secrets?|passwords?|credentials?|keys?|tokens?|external|third party|vendor|partner|per environment|each environment|different)\b/u;

const lines = (cited: string): readonly string[] =>
  cited.split(/\r?\n/u).filter((line) => !line.includes('?') && !/\b(?:TODO|FIXME)\b/iu.test(line));

/** The first procedure the lines declare, else the module they name. */
function sourceName(cited: string): string | undefined {
  const held = lines(cited);
  const first = (pattern: RegExp): string | undefined =>
    held.map((line) => pattern.exec(line)?.[1]).find((name) => name !== undefined);
  return first(procedure) ?? first(moduleName);
}

/** The thing the cited lines hold that the question asks for, or undefined when the question stands. */
// RF-243
export function kindAnsweredByCitedLines(question: string, cited: string): string | undefined {
  const lower = question.toLowerCase().replace(/\s+/gu, ' ').trim();
  if (stands.test(lower)) return undefined;
  for (const kind of [connection, publish]) {
    if (kind.asks.test(lower) && lines(cited).some((line) => kind.defines.test(line)))
      return kind.name;
  }
  return sourceAsk.test(lower) ? sourceName(cited) : undefined;
}
