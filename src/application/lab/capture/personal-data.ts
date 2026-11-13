// RF-1404, RNF-003: nothing personal is committed in a case. A captured input that holds an e-mail
// address, a drive path, a home folder or something that looks like a key is left out whole.

const patterns: readonly (readonly [string, RegExp])[] = [
  ['an e-mail address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/u],
  ['a drive path', /\b[A-Za-z]:[\\/][^\s"']/u],
  ['a home folder', /(?:\/Users\/|\/home\/|[\\]Users[\\])[A-Za-z0-9._-]+/u],
  ['a key', /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,})/u],
];

/** What kind of personal data the text holds, or undefined. */
// RF-1404
export function personalDataIn(text: string): string | undefined {
  return patterns.find(([, pattern]) => pattern.test(text))?.[0];
}
