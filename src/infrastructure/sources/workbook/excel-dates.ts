// RF-152: which number formats are dates, and what a serial number is as an ISO date. Excel stores a
// date as the days since a base day; the format code alone says whether a number is shown as one.
// Only arithmetic on UTC milliseconds is used, so the result never depends on the machine.

export interface DateSpec {
  readonly kind: 'date' | 'time' | 'datetime';
  /** `[h]`: hours are counted in total and may pass 24. */
  readonly elapsed: boolean;
}

const MAX_FORMAT = 256;
const DAY_SECONDS = 86_400;
const LAST_SERIAL = 2_958_465;
const FIRST_DAY_1900 = Date.UTC(1899, 11, 31);
const BASE_1900 = Date.UTC(1899, 11, 30);
const BASE_1904 = Date.UTC(1904, 0, 1);
const DAY_MS = 86_400_000;
const LEAP_BUG = 60;

/** The first section of a format with its text, escapes and colours removed and minutes marked `n`. */
function lettersOf(format: string): { letters: string; elapsed: boolean } {
  let elapsed = false;
  const stripped = format
    .replace(/"[^"]*"/gu, '')
    .replace(/\\.|_.|\*./gu, '')
    .replace(/\[([^\]]*)\]/gu, (_all, inner: string) => {
      if (/^h+$/iu.test(inner)) elapsed = true;
      return /^[hms]+$/iu.test(inner) ? inner.slice(0, 1) : '';
    });
  const letters = (stripped.split(';')[0] ?? '')
    .toLowerCase()
    .replace(/general|standard|scientific/gu, '')
    .replace(/am\/pm|a\/p/gu, '')
    .replace(/(h+[^a-z]*)m+/gu, '$1n')
    .replace(/m+([^a-z]*s)/gu, 'n$1');
  return { letters, elapsed };
}

/** The kind of date a format code shows, or `undefined` for a format that is not a date. */
export function dateSpecOf(format: string): DateSpec | undefined {
  if (format.length > MAX_FORMAT) return undefined;
  const { letters, elapsed } = lettersOf(format);
  const hasDate = /[ydm]/u.test(letters);
  const hasTime = /[hsn]/u.test(letters);
  if (!hasDate && !hasTime) return undefined;
  return { kind: hasDate ? (hasTime ? 'datetime' : 'date') : 'time', elapsed };
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

function timeText(totalSeconds: number, elapsed: boolean): string {
  const seconds = elapsed ? totalSeconds : totalSeconds % DAY_SECONDS;
  const hours = Math.floor(seconds / 3600);
  return `${two(hours)}:${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`;
}

function dayText(days: number, date1904: boolean): string | undefined {
  if (!date1904 && days === 0) return '1900-01-00';
  if (!date1904 && days === LEAP_BUG) return '1900-02-29';
  const base = date1904 ? BASE_1904 : days < LEAP_BUG ? FIRST_DAY_1900 : BASE_1900;
  const iso = new Date(base + days * DAY_MS).toISOString();
  return /^\d{4}-/u.test(iso) ? iso.slice(0, 10) : undefined;
}

/** The ISO text of a serial number, or `undefined` when it is not a date Excel could show. */
export function serialToIso(serial: number, date1904: boolean, spec: DateSpec): string | undefined {
  if (!Number.isFinite(serial) || serial < 0 || serial > LAST_SERIAL) return undefined;
  const total = Math.round(serial * DAY_SECONDS);
  const time = timeText(total, spec.elapsed);
  if (spec.kind === 'time') return time;
  const day = dayText(Math.floor(total / DAY_SECONDS), date1904);
  if (day === undefined) return undefined;
  return spec.kind === 'date' ? day : `${day}T${time}`;
}
