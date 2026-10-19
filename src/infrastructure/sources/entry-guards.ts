// RF-122, RF-127, RF-129: the checks that every archive extractor shares, so a tarball and a zip
// are held to one bar (ADR-019, ADR-022). The tarball extractor is in `../github/`, the zip
// extractor in this folder; neither repeats a rule written here.

/** Windows device names, with or without an extension, a trailing dot or space, or a stream (`CON:x`). */
const DEVICE_NAME = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/i;

function isDeviceName(segment: string): boolean {
  const base = segment.split(/[.:]/)[0] ?? '';
  return DEVICE_NAME.test(base.trimEnd());
}

/** `..`, and the segments Windows trims to `..` or to nothing: only dots and spaces, other than a lone `.`. */
function isDotSegment(segment: string): boolean {
  return segment !== '.' && /^[. ]+$/.test(segment);
}

const DRIVE_FORM = /^[A-Za-z]:/;
const SEPARATORS = /[\\/]/;

/** The segments of an entry path, on either separator. */
export function splitPath(path: string): string[] {
  return path.split(SEPARATORS);
}

/**
 * An absolute path (POSIX or Windows), a UNC or backslash-rooted path, a `..` or dot-only segment, a
 * drive letter at the start of the path, or a NUL character, on either separator (RF-122, RF-129,
 * ADR-019). Such an entry stops the extraction.
 */
export function isUnsafePath(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('\\') || path.includes('\0')) return true;
  const segments = splitPath(path);
  return segments.some(isDotSegment) || DRIVE_FORM.test(segments[0] ?? '');
}

/**
 * Whether one of these segments is a name Windows cannot write: a device name (`aux.c`, `COM1`) or
 * a `:`. Real repositories hold them (the Linux kernel has `aux.c`), so the entry is skipped and
 * counted, never a reason to stop; the result does not depend on the OS. The caller leaves out the
 * top folder it strips.
 */
export function hasUnwritableSegment(segments: readonly string[]): boolean {
  return segments.some((segment) => segment.includes(':') || isDeviceName(segment));
}

/** Folders whose files are version control, build output or restored packages (RF-129). */
const LEFT_OUT_FOLDERS: ReadonlySet<string> = new Set(['.git', 'node_modules', 'bin', 'obj']);

/** Whether a folder on the way to the file (not the file name itself) is one that is left out; case is ignored. */
export function isInLeftOutFolder(segments: readonly string[]): boolean {
  return segments.slice(0, -1).some((folder) => LEFT_OUT_FOLDERS.has(folder.toLowerCase()));
}

/** A running total against a limit: entries or bytes (RF-127, RF-129). */
export class LimitCounter {
  private readonly limit: number;
  private total = 0;

  constructor(limit: number) {
    this.limit = limit;
  }

  /** Adds `amount`; false once the total is past the limit. */
  add(amount = 1): boolean {
    this.total += amount;
    return this.total <= this.limit;
  }
}
