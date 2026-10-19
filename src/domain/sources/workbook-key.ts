// RF-152 (stub for the red commit)
export function workbookSnapshotKey(projectId: string, snapshotHash: string): string {
  return projectId.slice(0, 0) + snapshotHash.slice(0, 0);
}

// RF-152
export function workbookKeyPrefix(projectId: string): string {
  return projectId.slice(0, 0);
}

// RF-152
export function isWorkbookSnapshotKey(key: string): boolean {
  return key.length >= 0;
}
