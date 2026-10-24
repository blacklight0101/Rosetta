import type {
  FileStatReader,
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../application/ports/output-writer.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { Recent } from './recent.js';

// RF-604, RF-1011, RF-1105, P5-28: the parse of a file of a run folder kept while the file keeps its
// version (size and modification time, asked of the file system on every read, as P5-22 does for the
// call log). The key holds the user, so one user's kept parse is never given for another's file. At
// most `most` files are kept, the least recently read out first; a file that is gone is forgotten.
// Two reads of one file that overlap share one refresh, so the three reads of Plan setup parse a
// card once. Without a stat reader nothing is kept and every read parses.

interface Kept<T> {
  readonly size: number;
  readonly modifiedMs: number;
  readonly value: T;
}

export class KeptFileParse<T> {
  readonly #reader: Pick<OutputWriter, 'readText'>;
  readonly #stats: FileStatReader | undefined;
  readonly #kept: Recent<Kept<T>>;
  readonly #refreshing = new Map<string, Promise<Result<T, WriteRefusal>>>();

  constructor(
    reader: Pick<OutputWriter, 'readText'>,
    stats: FileStatReader | undefined,
    most = 4096,
  ) {
    this.#reader = reader;
    this.#stats = stats;
    this.#kept = new Recent(most);
  }

  /** The parse of the file's text; the refusal of the file system when it cannot be read. */
  read(file: WorkspaceFile, parse: (text: string) => T): Promise<Result<T, WriteRefusal>> {
    if (this.#stats === undefined) return this.#load(file, parse);
    const key = `${file.userId}|${file.path}`;
    const running = this.#refreshing.get(key);
    if (running !== undefined) return running;
    const refresh = this.#refresh(key, file, parse, this.#stats).finally(() => {
      this.#refreshing.delete(key);
    });
    this.#refreshing.set(key, refresh);
    return refresh;
  }

  async #refresh(
    key: string,
    file: WorkspaceFile,
    parse: (text: string) => T,
    stats: FileStatReader,
  ): Promise<Result<T, WriteRefusal>> {
    const facts = await stats.statFile(file);
    if (!facts.ok) {
      this.#kept.delete(key);
      return err(facts.error);
    }
    const before = this.#kept.get(key);
    const { size, modifiedMs } = facts.value;
    if (before?.size === size && before.modifiedMs === modifiedMs) return ok(before.value);
    const loaded = await this.#load(file, parse);
    if (loaded.ok) this.#kept.set(key, { size, modifiedMs, value: loaded.value });
    else this.#kept.delete(key);
    return loaded;
  }

  async #load(file: WorkspaceFile, parse: (text: string) => T): Promise<Result<T, WriteRefusal>> {
    const read = await this.#reader.readText(file);
    return read.ok ? ok(parse(read.value)) : read;
  }
}
