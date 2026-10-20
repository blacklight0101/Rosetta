// RF-152, RFC-005 section 4.4: a sheet name or a workbook name made safe as a path segment. A
// character outside `A-Z a-z 0-9 . _ -` becomes `_`, runs of `_` collapse, a Windows device name gets
// a `_` prefix, the segment is cut to 64 characters, and a clash (compared without regard to case,
// as Windows and macOS compare) gets `~2`, `~3`. The mapping to the real name is written in
// `workbook.md`; this file only makes the segments.

const MAX_SEGMENT = 64;
const DEVICE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu;
const WORKBOOK_EXTENSION = /\.xls[xm]$/iu;

export interface SegmentOptions {
  /** Names already used in the same folder; a name that matches one of them gets a suffix. */
  readonly reserved?: readonly string[];
  /** The name of a workbook: the extension `.xlsx` or `.xlsm` survives the cut. */
  readonly keepExtension?: boolean;
}

function safeSegment(name: string, keepExtension: boolean): string {
  let segment = name
    .replace(/[^A-Za-z0-9._-]/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/\.+$/u, '');
  if (segment === '' || /^\.+$/u.test(segment)) segment = '_';
  if (DEVICE.test(segment.split('.')[0] ?? '')) segment = `_${segment}`;
  const extension = keepExtension ? (WORKBOOK_EXTENSION.exec(segment)?.[0] ?? '') : '';
  const stem = segment.slice(0, segment.length - extension.length);
  const cut = stem.slice(0, MAX_SEGMENT - extension.length);
  return `${extension === '' ? cut.replace(/\.+$/u, '') || '_' : cut}${extension}`;
}

/** One safe, distinct segment per name, in the order of the names; the same names give the same segments. */
export function allocateSegments(names: readonly string[], options: SegmentOptions = {}): string[] {
  const taken = new Set((options.reserved ?? []).map((name) => name.toLowerCase()));
  return names.map((name) => {
    const base = safeSegment(name, options.keepExtension === true);
    let candidate = base;
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${base}~${String(n)}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
