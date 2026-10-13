import { lstat, realpath } from 'node:fs/promises';

// RF-008, RF-1012, RF-005: a folder Rosetta built from ids is used only when it is a real folder:
// it exists, is not a link, and no folder above it is one (the real path of a folder reached through
// a link differs from the path that was built).

/** True when `folder` is a real folder; `folder` must be built from the real path of its root. */
export async function isRealFolder(folder: string): Promise<boolean> {
  const info = await lstat(folder).catch(() => undefined);
  if (!info?.isDirectory()) return false;
  return (await realpath(folder)) === folder;
}
