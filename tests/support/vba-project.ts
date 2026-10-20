import CFB from 'cfb';
import { compressOvba } from './ovba-compress.js';
import { buildDirStream, type DirModuleSpec } from './ovba-dir.js';

// P3-45: a `vbaProject.bin` composed inside the test with `cfb` (the compound file) and the
// test-side compressor (the module and `dir` streams). Nothing is committed, nothing is real.

type ModuleKind = 'standard' | 'class' | 'document' | 'form';

interface ModuleSpec {
  readonly name: string;
  readonly kind: ModuleKind;
  /** The source as text (latin1 bytes) or as bytes in the project's code page. */
  readonly source?: string | Buffer;
  /** Only compiled code: the stream holds the performance cache and no compressed source. */
  readonly compiledOnly?: boolean;
  /** Replaces the text offset written in the `dir` stream. */
  readonly offset?: number;
  /** Replaces the whole module stream. */
  readonly rawStream?: Buffer;
  /** Leaves the module stream out of the file. */
  readonly omitStream?: boolean;
  /** Controls of a user form, written as the form's `VBFrame` text. */
  readonly controls?: readonly { readonly name: string; readonly type: string }[];
  readonly nameBytes?: Buffer;
}

export interface ProjectSpec {
  readonly modules: readonly ModuleSpec[];
  readonly codePage?: number;
  readonly locked?: boolean;
  /** Replaces the decompressed `dir` stream. */
  readonly dirStream?: Buffer;
  readonly declaredCount?: number;
  readonly unknownRecordId?: number;
  readonly omitDir?: boolean;
  /** Lines added to the PROJECT stream after the module lines. */
  readonly projectLines?: readonly string[];
  /** Replaces the compressed `dir` stream with these bytes, as they are stored. */
  readonly rawDir?: Buffer;
}

const CACHE = Buffer.from('compiled performance cache, not source code'.padEnd(40, '.'));

/** `versionXor` is what the seed is combined with to give VersionEnc; the format wants 2. */
export function encrypt(data: Buffer, seed: number, projectKey: number, versionXor = 2): Buffer {
  const out: number[] = [seed, seed ^ versionXor, seed ^ projectKey];
  let encrypted2 = out[1] ?? 0;
  let encrypted1 = out[2] ?? 0;
  let plain1 = projectKey;
  const bytes = [
    ...Array.from({ length: (seed & 6) >> 1 }, () => 0x11),
    ...[data.length, data.length >> 8, data.length >> 16, data.length >> 24].map((b) => b & 0xff),
    ...data,
  ];
  for (const plain of bytes) {
    const cipher = plain ^ ((encrypted2 + plain1) & 0xff);
    out.push(cipher);
    encrypted2 = encrypted1;
    encrypted1 = cipher;
    plain1 = plain;
  }
  return Buffer.from(out);
}

/** `CMG="..."` of the PROJECT stream: the protection state of section 2.3.1.15, obfuscated. */
export function protectionLine(state: number, seed = 0x5a, projectKey = 0x21): string {
  const data = Buffer.from([state, 0, 0, 0]);
  return `CMG="${encrypt(data, seed, projectKey).toString('hex').toUpperCase()}"`;
}

function projectStream(spec: ProjectSpec): Buffer {
  const lines = ['ID="{00000000-0000-0000-0000-000000000000}"'];
  for (const module of spec.modules) {
    if (module.kind === 'standard') lines.push(`Module=${module.name}`);
    if (module.kind === 'class') lines.push(`Class=${module.name}`);
    if (module.kind === 'document') lines.push(`Document=${module.name}/&H00000000`);
    if (module.kind === 'form') lines.push(`BaseClass=${module.name}`);
  }
  lines.push('Name="VBAProject"');
  if (spec.locked === true) lines.push(protectionLine(0x04));
  lines.push(...(spec.projectLines ?? []));
  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'latin1');
}

function moduleStream(module: ModuleSpec): Buffer {
  if (module.rawStream !== undefined) return module.rawStream;
  if (module.compiledOnly === true) return CACHE;
  const source =
    typeof module.source === 'string' ? Buffer.from(module.source, 'latin1') : module.source;
  return Buffer.concat([CACHE, compressOvba(source ?? Buffer.alloc(0))]);
}

function frameText(module: ModuleSpec): Buffer {
  const lines = ['VERSION 5.00', `Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} ${module.name} `];
  for (const control of module.controls ?? []) {
    lines.push(`   Begin ${control.type} ${control.name} `, '   End');
  }
  lines.push('End');
  return Buffer.from(lines.join('\r\n'), 'latin1');
}

function dirModules(spec: ProjectSpec): DirModuleSpec[] {
  return spec.modules.map((module) => ({
    name: module.name,
    offset: module.offset ?? CACHE.length,
    standard: module.kind === 'standard',
    ...(module.nameBytes === undefined ? {} : { nameBytes: module.nameBytes }),
  }));
}

function compressedDir(spec: ProjectSpec): Buffer {
  if (spec.rawDir !== undefined) return spec.rawDir;
  const dir =
    spec.dirStream ??
    buildDirStream({
      modules: dirModules(spec),
      ...(spec.codePage === undefined ? {} : { codePage: spec.codePage }),
      ...(spec.declaredCount === undefined ? {} : { declaredCount: spec.declaredCount }),
      ...(spec.unknownRecordId === undefined ? {} : { unknownRecordId: spec.unknownRecordId }),
    });
  return compressOvba(dir);
}

/** The bytes of a compound file holding the VBA project described by `spec`. */
export function buildVbaProject(spec: ProjectSpec): Buffer {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, '/PROJECT', projectStream(spec));
  if (spec.omitDir !== true) CFB.utils.cfb_add(container, '/VBA/dir', compressedDir(spec));
  for (const module of spec.modules) {
    if (module.omitStream !== true) {
      CFB.utils.cfb_add(container, `/VBA/${module.name}`, moduleStream(module));
    }
    if (module.kind === 'form') {
      CFB.utils.cfb_add(container, `/${module.name}/VBFrame`, frameText(module));
    }
  }
  const written: unknown = CFB.write(container, { type: 'buffer' });
  if (!Buffer.isBuffer(written)) throw new Error('cfb did not return a buffer');
  return written;
}
