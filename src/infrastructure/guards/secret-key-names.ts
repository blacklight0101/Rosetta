// RF-141, RNF-003: the property names whose value is a secret whatever it looks like. The last word
// of the key decides (camelCase, acronym runs such as `APIToken`, snake_case and kebab-case are split
// into words; digits are not letters, so `token2` ends in `token`), so `accessToken`,
// `client_secret`, `X-Auth-Token`, `proxyAuthorization` and `bearer` match, while a count or a limit
// that only has the word in the middle (`inputTokens`, `timeToFirstTokenMs`, `areaTokenBudget`,
// `secretCount`) does not. A short suffix that starts with a digit is not a word (`Secret_2FA`,
// `Secret2FA`). The last two words decide too: `tokenValue`, `secretValue` and `secretKey`. A bare
// plural `tokens` is a count more often than not, so it matches only after a word that names a
// credential (`refreshTokens`, `access_tokens`), never after `input`, `output` or `context`.
const passwordMarker = '[MASKED:password]';
const tokenMarker = '[MASKED:bearer-token]';

const markerByLastWord: ReadonlyMap<string, string> = new Map([
  ['secret', passwordMarker],
  ['secrets', passwordMarker],
  ['token', tokenMarker],
  ['authorization', tokenMarker],
  ['bearer', tokenMarker],
]);

const markerByLastTwoWords: ReadonlyMap<string, string> = new Map([
  ['secret key', passwordMarker],
  ['secret value', passwordMarker],
  ['token value', tokenMarker],
  ...['access', 'refresh', 'id', 'auth', 'bearer', 'session', 'api', 'jwt'].map(
    (word): [string, string] => [`${word} tokens`, tokenMarker],
  ),
]);

// A digit, then at most three letters of one case, at the end of the key (`2`, `_2FA`, `-2fa`).
const digitSuffix = /[_-]?\d+(?:[A-Z]{1,3}|[a-z]{1,3})?$/u;

function wordsOf(key: string): readonly string[] {
  return key
    .replace(digitSuffix, '')
    .replace(/(?<lower>[a-z0-9])(?=[A-Z])/gu, '$<lower> ')
    .replace(/(?<upper>[A-Z])(?=[A-Z][a-z])/gu, '$<upper> ')
    .toLowerCase()
    .split(/[^a-z]+/u)
    .filter((word) => word !== '');
}

/** The marker that replaces the whole value under `key`, or undefined when the key names no such secret. */
export function secretKeyMarker(key: string): string | undefined {
  const words = wordsOf(key);
  return (
    markerByLastWord.get(words.at(-1) ?? '') ?? markerByLastTwoWords.get(words.slice(-2).join(' '))
  );
}
