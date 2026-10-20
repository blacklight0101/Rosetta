import { err, ok, type Result } from '../../../domain/errors/result.js';
import { decodeText, encodingFor, FALLBACK_ENCODING } from './ovba-code-page.js';

// RF-154, MS-OVBA section 2.3.4: the decompressed `dir` stream is a run of records, each an id, a
// four-byte size and that many bytes of data. The parser reads the ones it needs and skips every
// other id by its size, so a record it does not know cannot stop it. Every size is checked
// against the bytes that remain before it is used, and the module count against the limit.

export interface DirModule {
  readonly name: string;
  readonly streamName: string;
  /** Where the compressed source starts in the module stream; absent when no record says. */
  readonly offset?: number;
  /** A standard (procedural) module; every other module is a class, document or designer. */
  readonly standard: boolean;
}

export interface DirInfo {
  readonly codePage: number;
  readonly encoding: string;
  readonly projectName: string;
  readonly modules: readonly DirModule[];
}

export interface DirFailure {
  readonly reason: 'corrupt' | 'too-many';
  readonly detail: string;
}

const HEADER_BYTES = 6;
/** PROJECTVERSION: its size field counts VersionMajor; the two bytes of VersionMinor follow it. */
const PROJECT_VERSION_EXTRA = 2;

const ID = {
  codePage: 0x0003,
  projectName: 0x0004,
  version: 0x0009,
  terminator: 0x0010,
  moduleCount: 0x000f,
  moduleName: 0x0019,
  streamName: 0x001a,
  typeStandard: 0x0021,
  typeOther: 0x0022,
  offset: 0x0031,
  streamNameUnicode: 0x0032,
  moduleNameUnicode: 0x0047,
} as const;

function viewOf(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

interface ModuleDraft {
  name: string;
  streamName: string;
  offset?: number;
  standard: boolean;
  unicodeStream: boolean;
}

class DirReader {
  private codePage = 1252;
  private encoding = FALLBACK_ENCODING;
  private projectName = '';
  private current: ModuleDraft | undefined;
  private readonly modules: ModuleDraft[] = [];
  private readonly maxModules: number;

  constructor(maxModules: number) {
    this.maxModules = maxModules;
  }

  /** Applies one record; a failure stops the parse. */
  apply(id: number, data: Uint8Array): DirFailure | undefined {
    if (id === ID.codePage && data.length >= 2) this.setCodePage(data);
    if (id === ID.projectName) this.projectName = this.text(data);
    if (id === ID.moduleCount && data.length >= 2) return this.checkCount(data);
    if (id === ID.moduleName) return this.startModule(data);
    this.applyToModule(id, data);
    return undefined;
  }

  private applyToModule(id: number, data: Uint8Array): void {
    const module = this.current;
    if (module === undefined) return;
    if (id === ID.moduleNameUnicode) {
      module.name = decodeText(data, 'utf-16le');
    } else if (id === ID.streamName && !module.unicodeStream) {
      module.streamName = this.text(data);
    } else if (id === ID.streamNameUnicode) {
      module.streamName = decodeText(data, 'utf-16le');
      module.unicodeStream = true;
    } else if (id === ID.offset && data.length >= 4) {
      module.offset = viewOf(data).getUint32(0, true);
    } else if (id === ID.typeStandard || id === ID.typeOther) {
      module.standard = id === ID.typeStandard;
    }
  }

  finish(): DirInfo {
    return {
      codePage: this.codePage,
      encoding: this.encoding,
      projectName: this.projectName,
      modules: this.modules.map(({ name, streamName, offset, standard }) => ({
        name,
        streamName,
        standard,
        ...(offset === undefined ? {} : { offset }),
      })),
    };
  }

  private text(data: Uint8Array): string {
    return decodeText(data, this.encoding);
  }

  private setCodePage(data: Uint8Array): void {
    this.codePage = viewOf(data).getUint16(0, true);
    this.encoding = encodingFor(this.codePage);
  }

  private checkCount(data: Uint8Array): DirFailure | undefined {
    const declared = viewOf(data).getUint16(0, true);
    return declared > this.maxModules ? this.tooMany() : undefined;
  }

  private startModule(data: Uint8Array): DirFailure | undefined {
    if (this.modules.length >= this.maxModules) return this.tooMany();
    const name = this.text(data);
    this.current = {
      name,
      streamName: name,
      standard: false,
      unicodeStream: false,
    };
    this.modules.push(this.current);
    return undefined;
  }

  private tooMany(): DirFailure {
    return { reason: 'too-many', detail: `more than ${String(this.maxModules)} modules` };
  }
}

/** Parses a decompressed `dir` stream; at most `maxModules` modules are accepted. */
export function parseDirStream(dir: Uint8Array, maxModules: number): Result<DirInfo, DirFailure> {
  const view = viewOf(dir);
  const reader = new DirReader(maxModules);
  let at = 0;
  while (at + HEADER_BYTES <= dir.length) {
    const id = view.getUint16(at, true);
    const size = view.getUint32(at + 2, true);
    const start = at + HEADER_BYTES;
    const end = start + size + (id === ID.version ? PROJECT_VERSION_EXTRA : 0);
    if (end > dir.length) {
      return err({ reason: 'corrupt', detail: 'a record runs past the end of the stream' });
    }
    if (id === ID.terminator) return ok(reader.finish());
    const failure = reader.apply(id, dir.subarray(start, start + size));
    if (failure !== undefined) return err(failure);
    at = end;
  }
  return err({ reason: 'corrupt', detail: 'the stream has no terminator' });
}
