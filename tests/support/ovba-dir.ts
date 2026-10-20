// P3-45: the `dir` stream of MS-OVBA section 2.3.4, written for the tests. Every record is an id,
// a four-byte size and the data; the two quirks of the format (PROJECTVERSION carries six more
// bytes than its size says, MODULETYPE has size 0) are kept so the parser meets what Excel writes.

export function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

export function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

export function record(id: number, data: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([u16(id), u32(data.length), data]);
}

export interface DirModuleSpec {
  readonly name: string;
  /** Defaults to the module name. */
  readonly streamName?: string;
  readonly offset: number;
  readonly standard: boolean;
  /** The name as bytes in the project's code page; the default is latin1 of `name`. */
  readonly nameBytes?: Buffer;
}

export interface DirSpec {
  readonly codePage?: number;
  readonly projectName?: string;
  readonly modules: readonly DirModuleSpec[];
  /** The module count written in the PROJECTMODULES record; the default is the real count. */
  readonly declaredCount?: number;
  /** A record with this id written inside every module, before its terminator. */
  readonly unknownRecordId?: number;
  /** Cut the stream to this many bytes. */
  readonly truncateTo?: number;
}

function moduleRecords(module: DirModuleSpec, unknownId: number | undefined): Buffer[] {
  const name = module.nameBytes ?? Buffer.from(module.name, 'latin1');
  const stream = Buffer.from(module.streamName ?? module.name, 'latin1');
  const unicodeStream = Buffer.from(module.streamName ?? module.name, 'utf16le');
  return [
    record(0x0019, name),
    record(0x0047, Buffer.from(module.name, 'utf16le')),
    record(0x001a, stream),
    record(0x0032, unicodeStream),
    record(0x001c),
    record(0x0048),
    record(0x0031, u32(module.offset)),
    record(0x001e, u32(0)),
    record(0x002c, u16(0xffff)),
    record(module.standard ? 0x0021 : 0x0022),
    ...(unknownId === undefined ? [] : [record(unknownId, Buffer.from('unknown'))]),
    record(0x002b),
  ];
}

/** The decompressed bytes of a `dir` stream. */
export function buildDirStream(spec: DirSpec): Buffer {
  const name = Buffer.from(spec.projectName ?? 'VBAProject', 'latin1');
  const records = [
    record(0x0001, u32(1)),
    record(0x0002, u32(0x409)),
    record(0x0014, u32(0x409)),
    record(0x0003, u16(spec.codePage ?? 1252)),
    record(0x0004, name),
    record(0x0005),
    record(0x0040),
    record(0x0006),
    record(0x003d),
    record(0x0007, u32(0)),
    record(0x0008, u32(0)),
    Buffer.concat([u16(0x0009), u32(4), u32(1), u16(2)]),
    record(0x0016, Buffer.from('stdole')),
    record(0x003e, Buffer.from('stdole', 'utf16le')),
    record(0x000d, Buffer.from('registered reference')),
    record(0x000f, u16(spec.declaredCount ?? spec.modules.length)),
    record(0x0013, u16(0xffff)),
    ...spec.modules.flatMap((module) => moduleRecords(module, spec.unknownRecordId)),
    record(0x0010),
  ];
  const stream = Buffer.concat(records);
  return spec.truncateTo === undefined ? stream : stream.subarray(0, spec.truncateTo);
}
