import { secretKeyMarker } from './secret-key-names.js';
import type { TextMasker } from './secret-masker.js';

// RF-141, RNF-003: masks a JSON-like value for a record that is kept (provider call lines,
// transcripts, audit details). Every key and every string is masked, and every primitive value is
// masked again together with its property name, so a secret whose only clue is its key
// (`{ "password": "..." }`, or each item of `{ "passwords": ["...", "..."] }`) is caught too. A masker failure is thrown (RST-2101); callers fail
// closed. A key whose last word is `secret`, `token` or `authorization` hides its whole value
// (secret-key-names.ts).

const maskedMarker = /\[MASKED:[a-z-]+\]/;

/** The value of a one-property JSON object text, or undefined when the text is not one. */
function onlyValueOf(objectText: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(objectText);
  } catch {
    return undefined;
  }
  return parsed !== null && typeof parsed === 'object' ? Object.values(parsed)[0] : undefined;
}

/** A primitive value masked alone, then together with its (masked) property name. */
function maskKeyed(key: string, value: unknown, masker: TextMasker): unknown {
  const alone = maskDeep(value, masker);
  if (alone === undefined) return undefined;
  const pair = `${JSON.stringify(key)}:${JSON.stringify(alone)}`;
  const masked = masker.mask(pair).text;
  if (masked === pair) return alone;
  // When the masked pair is no longer valid JSON, the whole value becomes the marker.
  return onlyValueOf(`{${masked}}`) ?? maskedMarker.exec(masked)?.[0] ?? '[MASKED:password]';
}

/** A property's value; each primitive item of an array it holds is masked with the key too. */
function maskUnderKey(key: string, item: unknown, masker: TextMasker): unknown {
  if (Array.isArray(item)) return item.map((inner: unknown) => maskUnderKey(key, inner, masker));
  if (item !== null && typeof item === 'object') return maskDeep(item, masker);
  return maskKeyed(key, item, masker);
}

function maskObject(value: object, masker: TextMasker): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]: [string, unknown]) => {
      const maskedKey = masker.mask(key).text;
      const marker = item === null ? undefined : secretKeyMarker(key);
      return [maskedKey, marker ?? maskUnderKey(maskedKey, item, masker)];
    }),
  );
}

/** The value with every secret replaced by its `[MASKED:<kind>]` marker. */
export function maskDeep(value: unknown, masker: TextMasker): unknown {
  if (typeof value === 'string') return masker.mask(value).text;
  if (Array.isArray(value)) return value.map((item: unknown) => maskDeep(item, masker));
  if (value !== null && typeof value === 'object') return maskObject(value, masker);
  return value;
}
