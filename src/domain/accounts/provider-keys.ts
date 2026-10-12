import { ERROR_CODES } from '../errors/codes.js';
import { err, ok, type Result } from '../errors/result.js';

// RF-1104, ADR-015, DEC-112: the rules of a user's provider key. A key belongs to one user and one
// provider; it is shown only by its last four characters, so it must be long enough that four
// characters are a small part of it; its sealed form is bound to its row by the additional data
// `user_id:provider`. Only an OpenAI-compatible key carries a base URL: https, no credentials,
// no query or fragment (the address itself is checked in infrastructure, on save and on connect).

/** The providers a user stores a key for (data-model.md section 4, `provider_keys.provider`). */
export const KEY_PROVIDERS = ['anthropic', 'openai', 'openai-compatible'] as const;

export type KeyProvider = (typeof KEY_PROVIDERS)[number];

/** The shortest key accepted, in characters: four of them must stay a small part of it. */
const MIN_KEY_LENGTH = 16;
/** The longest key accepted, in characters. */
export const MAX_KEY_LENGTH = 512;
/** The longest base URL accepted, in characters. */
export const MAX_BASE_URL_LENGTH = 2048;

const SHOWN_CHARACTERS = 4;

export interface BaseUrl {
  /** The normalised URL that is stored. */
  readonly href: string;
  /** The host to check, as the URL parser gives it (an IPv6 literal keeps its brackets). */
  readonly hostname: string;
}

// RF-1104
export function isKeyProvider(value: string): value is KeyProvider {
  return KEY_PROVIDERS.some((provider) => provider === value);
}

/** A space, a control character or a no-break space would break the request header. */
function isVisible(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code > 32 && !(code >= 127 && code <= 160);
}

// RF-1104
export function isUsableKeyValue(key: string): boolean {
  const characters = Array.from(key);
  const fits = characters.length >= MIN_KEY_LENGTH && characters.length <= MAX_KEY_LENGTH;
  return fits && characters.every(isVisible);
}

/** The only part of a key that ever leaves the server (RF-1104). */
// RF-1104
export function lastFourOf(key: string): string {
  return Array.from(key).slice(-SHOWN_CHARACTERS).join('');
}

/** Binds a sealed key to its row, so a value moved to another user or provider never opens. */
// RF-1104
export function keyAdditionalData(userId: string, provider: KeyProvider): string {
  return `${userId}:${provider}`;
}

// RF-1104
export function parseBaseUrl(text: string): Result<BaseUrl, typeof ERROR_CODES.baseUrlRejected> {
  if (text.length > MAX_BASE_URL_LENGTH || !URL.canParse(text)) {
    return err(ERROR_CODES.baseUrlRejected);
  }
  const url = new URL(text);
  if (url.protocol !== 'https:' || !isPlainUrl(url) || url.hostname === '') {
    return err(ERROR_CODES.baseUrlRejected);
  }
  return ok({ href: url.href, hostname: url.hostname });
}

/** No credentials and no query or fragment, not even a bare `?` or `#` (kept in `href` only). */
function isPlainUrl(url: URL): boolean {
  const bareMarker = url.href.endsWith('?') || url.href.endsWith('#');
  const noParts =
    url.username === '' && url.password === '' && url.search === '' && url.hash === '';
  return noParts && !bareMarker;
}
