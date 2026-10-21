// RF-264, P1-173: the lines of "What was not covered" grouped by the reason they give. The server
// writes one sentence per area (`standing.ts`); this reads the reason from the fixed words after the
// area name. A line it does not know goes to "Other" whole, so nothing is ever dropped.

interface Reason {
  readonly title: string;
  /** The words after the area name that give the reason. */
  readonly marker: string;
  /** The reason is the same for the whole group, so a line shows only the area. */
  readonly areaOnly: boolean;
}

const REASONS: readonly Reason[] = [
  { title: 'Not selected for this run', marker: ': not selected for this run.', areaOnly: true },
  { title: 'Third-party code', marker: ': third-party code;', areaOnly: true },
  {
    title: 'Its reader could not finish',
    marker: ': its reader could not finish (',
    areaOnly: false,
  },
  {
    title: 'The run ended before its reader finished',
    marker: ': the run ended before its reader finished.',
    areaOnly: true,
  },
  {
    title: 'No card passed the citation check',
    marker: ': no card passed the citation check.',
    areaOnly: true,
  },
];

const OTHER = 'Other';

/** The words the server's sentence about first-party files not read starts with (`unread-files.ts`). */
const UNREAD_PREFIX = 'First-party files not read: ';

export interface CoverageGroup {
  readonly title: string;
  /** What each line of the group shows: the area, or the whole sentence. */
  readonly lines: readonly string[];
}

function reasonOf(line: string): { readonly title: string; readonly shown: string } {
  for (const reason of REASONS) {
    const at = line.indexOf(reason.marker);
    if (at > 0) return { title: reason.title, shown: reason.areaOnly ? line.slice(0, at) : line };
  }
  return { title: OTHER, shown: line };
}

/** The groups in a fixed order, each with its lines in the order given; empty groups are left out. */
// RF-264
export function groupNotCovered(lines: readonly string[]): readonly CoverageGroup[] {
  const order = [...REASONS.map((reason) => reason.title), OTHER];
  const reasons = lines.map(reasonOf);
  return order.flatMap((title) => {
    const group = reasons.filter((reason) => reason.title === title).map((reason) => reason.shown);
    return group.length === 0 ? [] : [{ title, lines: group }];
  });
}

/** RF-264 (Q-53): the line about first-party files not read, apart from the area lines. */
export function splitUnreadFiles(lines: readonly string[]): {
  readonly unread: string | undefined;
  readonly areas: readonly string[];
} {
  const unread = lines.find((line) => line.startsWith(UNREAD_PREFIX));
  return { unread, areas: lines.filter((line) => line !== unread) };
}
