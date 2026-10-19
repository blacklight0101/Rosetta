// RF-131, RF-156, RFC-004 section 4.5, RFC-005 section 4.9: what the header of an output names for a
// source the user sent in place of a repository and a commit: the zip (or the Excel workbooks), the
// instant it was uploaded and the snapshot hash. A run whose manifest holds none of them (recorded
// before the name was kept) still says it is an upload.

export interface UploadFacts {
  /** The file name as sent, with its `.zip`; null for workbooks and when not recorded. */
  readonly fileName: string | null;
  /**
   * RF-156: the workbooks as sent, with their extensions. Present (even empty) only for a project
   * of Excel workbooks; absent for a zip.
   */
  readonly workbooks?: readonly string[] | undefined;
  /** ISO 8601 instant in UTC. */
  readonly uploadedAt: string | null;
  /** `sha256:` of the snapshot, its identity. */
  readonly snapshotHash: string | null;
}

/** What a header says when the manifest holds no file name. */
const UNNAMED_ZIP = 'An uploaded zip (its name was not recorded)';

/** What a header says when the manifest of a workbook run holds no workbook name. */
const UNNAMED_WORKBOOKS = 'Excel workbooks (their names were not recorded)';

/** `A.xlsx`, `A.xlsx and B.xlsm`, `A.xlsx, B.xlsx and C.xlsm`. */
function listOf(names: readonly string[]): string {
  const last = names.at(-1);
  if (names.length < 2 || last === undefined) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${last}`;
}

/** What a header says before the workbook names. */
const WORKBOOKS_PREFIX = 'Excel workbooks: ';

function workbooksSentence(facts: UploadFacts, names: readonly string[]): string {
  const known = [
    ...(facts.uploadedAt === null ? [] : [`uploaded ${facts.uploadedAt}`]),
    ...(facts.snapshotHash === null ? [] : [`snapshot ${facts.snapshotHash}`]),
  ];
  if (names.length === 0) known.unshift('their names were not recorded');
  const named =
    names.length === 0
      ? 'Excel workbooks'
      : `the Excel workbook${names.length === 1 ? '' : 's'} ${listOf(names)}`;
  return known.length === 0 ? named : `${named} (${known.join(', ')})`;
}

/** `the uploaded zip OrderDesk.zip (uploaded <instant>, snapshot <hash>)`, or what is known of it. */
// RF-131, RF-156
export function uploadSentence(facts: UploadFacts): string {
  if (facts.workbooks !== undefined) return workbooksSentence(facts, facts.workbooks);
  const { fileName, uploadedAt, snapshotHash } = facts;
  const known = [
    ...(uploadedAt === null ? [] : [`uploaded ${uploadedAt}`]),
    ...(snapshotHash === null ? [] : [`snapshot ${snapshotHash}`]),
  ];
  const named = fileName === null ? 'an uploaded zip' : `the uploaded zip ${fileName}`;
  if (fileName === null) known.unshift('its name was not recorded');
  return known.length === 0 ? named : `${named} (${known.join(', ')})`;
}

/**
 * The value of the Source row of a header: the zip, or the Excel workbooks, or what is said when no
 * name was recorded. `show` prepares each name for the document (escaping).
 */
// RF-131, RF-156
export function uploadHeading(facts: UploadFacts, show: (name: string) => string): string {
  const { fileName, workbooks } = facts;
  if (workbooks === undefined) return fileName === null ? UNNAMED_ZIP : show(fileName);
  return workbooks.length === 0
    ? UNNAMED_WORKBOOKS
    : WORKBOOKS_PREFIX + workbooks.map(show).join(', ');
}
