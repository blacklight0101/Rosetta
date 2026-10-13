// RF-141, RNF-003: the property names whose value is a secret whatever it looks like. The last word
// of the key decides (camelCase, acronym runs such as `APIToken`, snake_case and kebab-case are split
// into words; digits are not letters, so `token2` ends in `token`), so `accessToken`,
// `client_secret`, `X-Auth-Token` and `proxyAuthorization` match, while a count or a limit that only
// has the word in the middle (`inputTokens`, `timeToFirstTokenMs`, `areaTokenBudget`, `secretCount`)
// does not. A bare plural `tokens` is a count more often than not and is left to the text rules.
const markerByLastWord: ReadonlyMap<string, string> = new Map([
  ['secret', '[MASKED:password]'],
  ['secrets', '[MASKED:password]'],
  ['token', '[MASKED:bearer-token]'],
  ['authorization', '[MASKED:bearer-token]'],
]);

/** The marker that replaces the whole value under `key`, or undefined when the key names no such secret. */
export function secretKeyMarker(key: string): string | undefined {
  const words = key
    .replace(/(?<lower>[a-z0-9])(?=[A-Z])/gu, '$<lower> ')
    .replace(/(?<upper>[A-Z])(?=[A-Z][a-z])/gu, '$<upper> ')
    .toLowerCase()
    .split(/[^a-z]+/u)
    .filter((word) => word !== '');
  return markerByLastWord.get(words.at(-1) ?? '');
}
