import {
  lineEnd,
  notContinuation,
  optionStart,
  tokenBlank,
  tokenProse,
  tokenScheme,
  tokenValue,
} from './secret-option-pieces.js';
import { caseless, notMasked, placeholderValue } from './secret-value-pieces.js';

// P2-43 (RF-141, RNF-003): the secret shapes the first rules missed. They run after those rules, so a
// value they already replaced is never masked again. The same design: every rule is anchored on a
// keyword or a delimiter, a value runs to a delimiter its own class excludes, and the repeats are
// bounded, so a rule never rescans the input from every position.

interface ExtraRule {
  readonly kind: 'api-key' | 'bearer-token' | 'connection-string' | 'password';
  readonly pattern: RegExp;
}

// A value of 8 or more characters that is not code: no brackets, `$` or `<>`, not a path or a URL, and
// at least one digit or symbol (a letters-only word such as `introduction` is prose). Placeholders and
// the names of known configuration roots are left alone.
const valueChars = String.raw`[^\s"',;&]`;
const settingValue = String.raw`${notMasked}(?![="'])(?!${placeholderValue}|[/.~]|https?:|[A-Za-z]:\\)(?=${valueChars}{8,})(?!${valueChars}*[()\[\]{}<>$])(?=${valueChars}*[0-9+=!@#%^*~])${valueChars}+`;
const settingAssign = String.raw`["']?[ \t]{0,16}(?::=|[:=])[ \t]{0,16}["']?`;
// The word at the end of a key: in any case after a delimiter (`NPM_TOKEN`, `x-auth-token`), or with a
// capital after a letter or digit (`accessToken`, `APIToken`). The key must end there, so `max_tokens`,
// `inputTokens` and `secretCount` are not settings.
const wordEnd = (lower: string, capitalised: string): string =>
  String.raw`(?:(?<![A-Za-z0-9])${caseless(lower)}|(?<=[A-Za-z0-9])${capitalised})`;
const tokenName = wordEnd('token', 'Token');
const secretName = String.raw`(?:${wordEnd('secret', 'Secret')}(?:[_-]?${caseless('key')}|[_-]?${caseless('access')}[_-]?${caseless('key')})?|(?<![A-Za-z0-9])(?:${caseless('account')}|${caseless('shared')}[_-]?${caseless('access')})[_-]?${caseless('key')})`;

const keyedRule = (kind: ExtraRule['kind'], name: string): ExtraRule => ({
  kind,
  pattern: new RegExp(String.raw`(?<keep>${name}${settingAssign})${settingValue}`, 'g'),
});

// A command-line flag and its value (`--api-key <value>`, `--client-secret=<value>`), the same shape
// as `--token`. After a blank, a word of prose (`use --api-key to pass`) is not a value; a variable or
// a placeholder is not either.
const flagProse = String.raw`(?:flag|option|parameter|argument|value|switch|is|to|and|or|the|for|with|if|when|in|on|by|so|as)(?![\w.+/=@#$%^*~!:-])`;
const flagRule = (kind: ExtraRule['kind'], names: string): ExtraRule => ({
  kind,
  pattern: new RegExp(
    String.raw`(?<keep>${optionStart}(?:${names})(?:${tokenBlank}{1,16}(?!${flagProse})|=(?! ${tokenProse})${tokenBlank}{0,16})${notContinuation}${tokenScheme})${notMasked}(?!${placeholderValue}|["']?[$<{])${tokenValue}`,
    'gi',
  ),
});

const authorization = String.raw`\bAuthorization["']?[ \t]{0,16}[:=][ \t]{0,16}["']?`;
// The literal `://` comes first, so the scan jumps from one to the next; the scheme is checked behind it.
const urlScheme = String.raw`://(?<=\b[A-Za-z][A-Za-z0-9+.-]{0,31}://)`;
const b64 = '[A-Za-z0-9._~+/=-]';
// The words in front of a name that make an XML setting a secret (`Password`, `Vendor.ApiKey`).
const xmlSecretName = String.raw`(?:${caseless('password')}|${caseless('passwd')}|${caseless('pwd')}|${caseless('secret')}|${caseless('token')}|${caseless('api')}[_-]?${caseless('key')})`;

export const extraRules: readonly ExtraRule[] = [
  {
    // A JWT: two base64url parts that start with `eyJ` (the encoding of `{"`) and a signature.
    kind: 'bearer-token',
    pattern: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g,
  },
  {
    // Self-identifying keys: Google, Slack, SendGrid, Stripe webhook signing and Twilio API keys.
    kind: 'api-key',
    pattern:
      /(?<![A-Za-z0-9])(?:AIza[0-9A-Za-z_-]{35}|xox[abposr]-[A-Za-z0-9-]{10,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|whsec_[A-Za-z0-9+/=]{16,}|SK[0-9a-f]{32}(?![A-Za-z0-9]))/g,
  },
  {
    // An Azure shared access signature, in a connection string or an Authorization header.
    kind: 'api-key',
    pattern: new RegExp(
      String.raw`(?<keep>\bSharedAccessSignature(?:=|[ \t]+))${notMasked}(?=[a-z]{2,3}=)[^\s"';]+`,
      'g',
    ),
  },
  {
    // The signature of a SAS or other signed URL.
    kind: 'api-key',
    pattern: new RegExp(
      String.raw`(?<keep>[?&;](?:sig|signature)=)${notMasked}[A-Za-z0-9%+/=_-]{16,}`,
      'g',
    ),
  },
  flagRule('api-key', String.raw`api[_-]?key`),
  flagRule('bearer-token', String.raw`(?:auth|access|id|refresh|api)[_-]?token`),
  flagRule('password', String.raw`(?:client[_-]?)?secret`),
  {
    // `curl -u user:password` and `curl --user user:password`, anywhere on the command line.
    kind: 'password',
    pattern: new RegExp(
      String.raw`(?<keep>\bcurl(?:\.exe)?(?:[ \t]+(?:--?[A-Za-z][\w-]*|"[^"\r\n]{0,256}"|'[^'\r\n]{0,256}'|[^\s\-"'][^\s"']*)){0,16}?[ \t]+(?:-u|--user)(?:[ \t]+|=)["']?[^\s:"']{1,64}:)${notMasked}(?!["']?[$<{])[^\s"']+`,
      'gi',
    ),
  },
  {
    // The response of an Authorization Digest header (the hash of the password).
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>${authorization}Digest[ \t]{1,16}[^\r\n]{0,256}?\bresponse=\\?["']?)${notMasked}[0-9a-f]{16,}`,
      'gi',
    ),
  },
  {
    // The other schemes of an Authorization header: the value needs a digit or a base64 symbol.
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>${authorization}(?:ApiKey|Api-Key|NTLM|Negotiate|SSWS|Hawk|MAC)[ \t]{1,16})${notMasked}(?=${b64}{8,})(?=${b64}*[0-9+/=])${b64}+`,
      'gi',
    ),
  },
  {
    // An Authorization header with no scheme: a single value that ends the line or the string.
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>${authorization})${notMasked}(?=${b64}{16,}["']?[ \t]*(?:[,}"';)]|${lineEnd}|$))(?=${b64}*[0-9])${b64}+`,
      'gi',
    ),
  },
  {
    // `Basic <base64>` with no header name (a log line, a proxy setting): base64 of `user:password`.
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>\bBasic[ \t]{1,16})${notMasked}(?=[A-Za-z0-9+/]{16,}={0,2}(?![A-Za-z0-9+/=]))(?=[A-Za-z0-9+/]*[0-9]|[A-Za-z0-9+/]*[a-z][A-Za-z0-9+/]*[A-Z]|[A-Za-z0-9+/]+=)[A-Za-z0-9+/]+={0,2}`,
      'g',
    ),
  },
  {
    // A short Bearer value (6 to 19 characters) with no header name; the long ones are masked above.
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>\bBearer[ \t\u00a0]{1,16})${notMasked}(?=${b64}{6,19}(?!${b64}))(?=${b64}*[0-9])${b64}+`,
      'gi',
    ),
  },
  {
    // A URL password that holds a `/` (the first rule stops at it). A port (`host:8080/@user`) is not.
    kind: 'connection-string',
    pattern: new RegExp(
      String.raw`(?<keep>${urlScheme}[^\s:/@"'[\]]{0,256}:)${notMasked}(?!\d{1,5}/)(?:(?!://)[^\s"'/])*/(?:(?!://)[^\s"'])*(?=@[A-Za-z0-9.\-[\]:]+(?:[/?#\s"']|$))`,
      'g',
    ),
  },
  {
    // A token in the user part of a URL with no colon (`https://<token>@host/repo.git`).
    kind: 'connection-string',
    pattern: new RegExp(
      String.raw`(?<keep>${urlScheme})${notMasked}(?=[A-Za-z0-9._~%-]{0,256}[0-9])(?=[A-Za-z0-9._~%-]{0,256}[A-Za-z])[A-Za-z0-9._~%-]{20,256}(?=@)`,
      'g',
    ),
  },
  {
    // `<add key="Password" value="..."/>` in a .NET configuration file.
    kind: 'password',
    pattern: new RegExp(
      String.raw`(?<keep><add[ \t]+key=["'][\w.:-]*${xmlSecretName}["'][ \t]+value=["'])${notMasked}[^"'\r\n<>]+`,
      'g',
    ),
  },
  {
    // A session cookie set by a response header: the name holds `session`, `sid`, `token`, `auth`.
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>\bSet-Cookie["']?[ \t]{0,16}[:=][ \t]{0,16}["']?[\w.-]{0,64}?(?:session|sess|sid|token|auth|jwt)[\w.-]{0,32}=)${notMasked}[^\s;"',]{4,}`,
      'gi',
    ),
  },
  keyedRule('bearer-token', tokenName),
  keyedRule('password', secretName),
];
