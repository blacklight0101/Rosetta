// RF-131, RFC-004 section 4.5: what the header of an output names for an uploaded project in place
// of a repository and a commit: the zip, the instant it was uploaded and the snapshot hash. A run
// whose manifest holds none of them (recorded before the name was kept) still says it is an upload.

export interface UploadFacts {
  /** The file name as sent, with its `.zip`. */
  readonly fileName: string | null;
  /** ISO 8601 instant in UTC. */
  readonly uploadedAt: string | null;
  /** `sha256:` of the snapshot, its identity. */
  readonly snapshotHash: string | null;
}

/** What a header says when the manifest holds no file name. */
export const UNNAMED_ZIP = 'An uploaded zip (its name was not recorded)';

/** `the uploaded zip OrderDesk.zip (uploaded <instant>, snapshot <hash>)`, or what is known of it. */
// RF-131
export function uploadSentence(facts: UploadFacts): string {
  const { fileName, uploadedAt, snapshotHash } = facts;
  const known = [
    ...(uploadedAt === null ? [] : [`uploaded ${uploadedAt}`]),
    ...(snapshotHash === null ? [] : [`snapshot ${snapshotHash}`]),
  ];
  const named = fileName === null ? 'an uploaded zip' : `the uploaded zip ${fileName}`;
  if (fileName === null) known.unshift('its name was not recorded');
  return known.length === 0 ? named : `${named} (${known.join(', ')})`;
}
