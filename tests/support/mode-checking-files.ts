import { chmod, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { RemovalFileSystem } from '../../src/infrastructure/files/file-snapshot-cache.js';

// RF-1012, RF-005, P1-121: a RemovalFileSystem that refuses to remove a tree holding a file or a
// folder it was told is read-only, the way Linux refuses an entry of a read-only folder. Windows
// ignores the mode of a folder and Node removes a read-only file there anyway, and a process
// running as root ignores both, so a test of the adapter that only relies on the operating system
// can pass without the adapter making the tree writable. Every mode is also set on the real file.

const WRITE_BITS = 0o222;

function refused(path: string): Error {
  return Object.assign(new Error(`EACCES: permission denied, rm '${path}'`), { code: 'EACCES' });
}

export class ModeCheckingFiles implements RemovalFileSystem {
  readonly #modes = new Map<string, number>();

  async chmod(path: string, mode: number): Promise<void> {
    this.#modes.set(path, mode);
    await chmod(path, mode);
  }

  async rm(
    path: string,
    options: { readonly recursive: true; readonly force: true },
  ): Promise<void> {
    await this.#refuseReadOnly(path);
    await rm(path, options);
  }

  /** Throws EACCES when the path or anything under it was last made read-only through `chmod`. */
  async #refuseReadOnly(path: string): Promise<void> {
    const mode = this.#modes.get(path);
    if (mode !== undefined && (mode & WRITE_BITS) === 0) throw refused(path);
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) await this.#refuseReadOnly(join(path, entry.name));
  }
}
