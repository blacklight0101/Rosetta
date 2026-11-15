import { caseless, notMasked, placeholderValue } from './secret-value-pieces.js';

// RF-141 (P10 lab fixes): the SQL Server command-line tools (`sqlcmd`, `osql`, `bcp`) take the
// password after `-P` (case-sensitive: `-p` prints statistics). The rules name no key, so each is
// anchored on the tool name and finds the `-P` on the same line within 512 characters, lazily, so a
// tool name is read at most that far and the scan stays linear. Three shapes, one rule each:
//  - a shell word (`-P pw`, `-Ppw`, `-P "pw"`, `-P \"pw\"` inside a JSON string): a quoted value runs
//    to the closing quote of the same kind and escape, so the other quote (`"it's"`) and an escaped
//    quote inside it (`"a\"b"`) belong to the value; a bare value runs to a blank or a quote, and a
//    comma or a bracket belongs to it (`-P Fa,ke]x`);
//  - an exec array of quoted items (`"-P", "pw"`, or `\"-P\", \"pw\"` inside a JSON string, the
//    healthcheck of a docker-compose file): the value is the next item, to its closing quote;
//  - an exec array of plain items (YAML `[CMD, sqlcmd, -P, pw]`): there a comma or a bracket ends
//    the value, as it ends the item.
// The escape is one to four backslashes before the quote, as in secret-escaped-quote-rules.ts
// (P3-128), and a closing quote must carry the same escape and no longer run of backslashes. A
// variable (`$SA_PASSWORD`, `%PW%`, `$(PW)`), a flag, a placeholder and a word of prose are not
// values, and an already masked value is never masked again.

interface SqlToolRule {
  readonly kind: 'password';
  readonly pattern: RegExp;
}

const tool = String.raw`(?<![\w.-])(?:${caseless('sqlcmd')}|${caseless('osql')}|${caseless('bcp')})(?:\.${caseless('exe')})?(?![\w.-])`;
const onLine = String.raw`${tool}[^\r\n]{0,512}?`;
const escape = String.raw`\\{0,4}`;
const prose = String.raw`(?:to|as|the|and|or|is|with|for|flag|option|switch)(?![^\s"',\]])`;
const notValue = String.raw`${notMasked}(?![$%\-]|${placeholderValue}|${prose})`;

/** The closing quote of a value opened by the groups `e` (escape) and `q` (quote). */
const closeOf = (e: string, q: string): string => String.raw`(?<!\\)\k<${e}>\k<${q}>`;
/** A quoted value: to its closing quote, or to the end of the line when it has none. */
const quotedValue = (e: string, q: string): string =>
  String.raw`(?:(?!${closeOf(e, q)})[^\r\n])+(?=${closeOf(e, q)}|[\r\n]|$)`;

const rule = (keep: string, value: string): SqlToolRule => ({
  kind: 'password',
  pattern: new RegExp(String.raw`(?<keep>${onLine}${keep})${notValue}${value}`, 'g'),
});

export const sqlToolRules: readonly SqlToolRule[] = [
  // An exec array of quoted items: `"-P", "pw"` or `\"-P\", \"pw\"`.
  rule(
    String.raw`(?<=[\s,[])(?<ae>${escape})(?<aq>["'])-P(?<!\\)\k<ae>\k<aq>[ \t]*,[ \t]*\k<ae>\k<aq>`,
    quotedValue('ae', 'aq'),
  ),
  // An exec array of plain items: `-P, pw,` (a comma or a bracket ends the item).
  rule(
    String.raw`(?<=[\s,[])-P[ \t]*,[ \t]*`,
    String.raw`[^\s"',\]\\](?:[^"',\]\r\n\\]*[^\s"',\]\\])?`,
  ),
  // A shell word with a quoted value: `-P "pw"`, `-P'pw'`, `-P \"pw\"`.
  rule(String.raw`(?<=\s)-P[ \t]*(?<se>${escape})(?<sq>["'])`, quotedValue('se', 'sq')),
  // A shell word with a bare value: `-P pw` or `-Ppw`; a backslash before a quote ends it.
  rule(String.raw`(?<=\s)-P[ \t]*(?!\\{0,4}["']|[,\]])`, String.raw`(?:[^\s"'\\]|\\+(?![\\"']))+`),
];
