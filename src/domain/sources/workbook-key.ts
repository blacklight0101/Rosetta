// RF-152, RFC-005 section 4.1: the folder name of a workbook snapshot under `<data>/sources/`,
// `workbook__<project id>@<first 16 hex of the snapshot hash>`, beside the upload key
// (`upload__...`, upload-name.ts). The two prefixes are disjoint: a key of one is never the other.

const HASH_PREFIX = 'sha256:';
const HASH_CHARS = 16;
const WORKBOOK_KEY =
  /^workbook__[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[0-9a-f]{16}$/u;

/** `workbook__<project id>@<first 16 hex of the hash>` (RFC-005 section 4.1). */
// RF-152
export function workbookSnapshotKey(projectId: string, snapshotHash: string): string {
  const hex = snapshotHash.startsWith(HASH_PREFIX)
    ? snapshotHash.slice(HASH_PREFIX.length)
    : snapshotHash;
  return `${workbookKeyPrefix(projectId)}${hex.slice(0, HASH_CHARS)}`;
}

/** The folder-name prefix every snapshot of one project's workbooks shares. */
// RF-152
export function workbookKeyPrefix(projectId: string): string {
  return `workbook__${projectId}@`;
}

/** True for a folder name of the shape `workbook__<project id>@<16 hex>`. */
// RF-152
export function isWorkbookSnapshotKey(key: string): boolean {
  return WORKBOOK_KEY.test(key);
}
