import CFB from 'cfb';
import { compoundFileProblem } from './compound-guard.js';
import type { MacroLimits } from './macro-limits.js';
import { controlsOf } from './macro-forms.js';
import type {
  FormControl,
  MacroModule,
  MacroModuleKind,
  MacroProject,
  MacroSource,
} from './macro-model.js';
import { parseProjectStream, type ProjectStream } from './macro-project-stream.js';
import { decodeText, FALLBACK_ENCODING } from './ovba-code-page.js';
import { decompressOvba } from './ovba-decompress.js';
import { parseDirStream, type DirInfo, type DirModule } from './ovba-dir.js';
import { workbookTooLarge } from './workbook-errors.js';

// RF-154, RFC-005 section 4.6, ADR-023: reads the VBA project of an `.xlsm` as text. The compound
// file is opened with `cfb` after the guard has checked its tables; the `dir` stream and every
// module are decompressed with the MS-OVBA code of this folder. Damage stays with the project or
// the module it is in; a limit that is passed refuses the workbook (RST-1926). Nothing is run.

const FRAME_STREAM = '\u0003VBFrame';

function unreadable(reason: string): MacroProject {
  return {
    state: 'unreadable',
    reason,
    codePage: 1252,
    encoding: FALLBACK_ENCODING,
    modules: [],
    formControls: [],
  };
}

/** The streams of one compound file by path, listed once so a lookup costs nothing. */
class Container {
  private readonly streams = new Map<string, Buffer>();

  constructor(container: CFB.CFB$Container) {
    container.FileIndex.forEach((entry, index) => {
      const path = (container.FullPaths[index] ?? '').split('/').slice(1).join('/').toLowerCase();
      if (Buffer.isBuffer(entry.content) && !this.streams.has(path)) {
        this.streams.set(path, entry.content);
      }
    });
  }

  stream(path: string): Buffer | undefined {
    return this.streams.get(path.toLowerCase());
  }
}

/** Source bytes counted against the project limit as modules are decompressed. */
class SourceBudget {
  private used = 0;
  private readonly limits: MacroLimits;

  constructor(limits: MacroLimits) {
    this.limits = limits;
  }

  /** The most the next module may decompress to. */
  next(): number {
    return Math.min(this.limits.maxModuleBytes, this.limits.maxSourceBytes - this.used);
  }

  add(bytes: number): void {
    this.used += bytes;
  }
}

function sourceOf(
  module: DirModule,
  streams: Container,
  budget: SourceBudget,
  encoding: string,
): MacroSource {
  const stream = streams.stream(`VBA/${module.streamName}`);
  if (stream === undefined) return { status: 'unreadable', reason: 'the module stream is missing' };
  if (module.offset === undefined) {
    return { status: 'unreadable', reason: 'the dir stream gives no text offset' };
  }
  if (module.offset > stream.length) {
    return { status: 'unreadable', reason: 'the text offset is past the end of the stream' };
  }
  if (module.offset === stream.length) return { status: 'no-source' };
  const result = decompressOvba(stream.subarray(module.offset), budget.next());
  if (!result.ok) {
    if (result.error.reason === 'too-large')
      throw workbookTooLarge('bytes of macro source', budget.next());
    return { status: 'unreadable', reason: result.error.detail };
  }
  budget.add(result.value.length);
  if (result.value.length === 0) return { status: 'no-source' };
  return { status: 'text', text: decodeText(result.value, encoding) };
}

function kindOf(module: DirModule, project: ProjectStream): MacroModuleKind {
  if (module.standard) return 'standard';
  const kind = project.kinds.get(module.name.toLowerCase());
  return kind === undefined || kind === 'standard' ? 'class' : kind;
}

function controlsFor(
  module: MacroModule,
  streams: Container,
  limits: MacroLimits,
  encoding: string,
): FormControl[] {
  if (module.kind !== 'form') return [];
  const frame = streams.stream(`${module.name}/${FRAME_STREAM}`);
  if (frame === undefined) return [];
  if (frame.length > limits.maxTextStreamBytes) {
    throw workbookTooLarge('bytes in a form definition', limits.maxTextStreamBytes);
  }
  return controlsOf(module.name, decodeText(frame, encoding));
}

function dirOf(streams: Container, limits: MacroLimits): DirInfo | string {
  const compressed = streams.stream('VBA/dir');
  if (compressed === undefined) return 'the dir stream is missing';
  const dir = decompressOvba(compressed, limits.maxDirBytes);
  if (!dir.ok) {
    if (dir.error.reason === 'too-large') {
      throw workbookTooLarge('bytes in the macro directory', limits.maxDirBytes);
    }
    return dir.error.detail;
  }
  const info = parseDirStream(dir.value, limits.maxModules);
  if (info.ok) return info.value;
  if (info.error.reason === 'too-many') throw workbookTooLarge('macro modules', limits.maxModules);
  return info.error.detail;
}

function projectStreamOf(streams: Container, limits: MacroLimits, encoding: string): ProjectStream {
  const text = streams.stream('PROJECT');
  if (text === undefined) return { kinds: new Map(), locked: false };
  if (text.length > limits.maxTextStreamBytes) {
    throw workbookTooLarge('bytes in the macro project description', limits.maxTextStreamBytes);
  }
  return parseProjectStream(decodeText(text, encoding));
}

function openContainer(bytes: Uint8Array): Container | string {
  const problem = compoundFileProblem(bytes);
  if (problem !== undefined) return problem;
  try {
    return new Container(CFB.read(Buffer.from(bytes), { type: 'buffer' }));
  } catch {
    return 'the compound file is damaged';
  }
}

/**
 * Reads the project in `bytes` (the content of `xl/vbaProject.bin`). A damaged project comes back as
 * `unreadable`; a bound that is passed throws RST-1926.
 */
export function readMacroProject(bytes: Uint8Array, limits: MacroLimits): MacroProject {
  const streams = openContainer(bytes);
  if (typeof streams === 'string') return unreadable(streams);
  const dir = dirOf(streams, limits);
  if (typeof dir === 'string') return unreadable(dir);
  const project = projectStreamOf(streams, limits, dir.encoding);
  const budget = new SourceBudget(limits);
  const modules: MacroModule[] = dir.modules.map((module) => ({
    name: module.name,
    kind: kindOf(module, project),
    extension: module.standard ? 'bas' : 'cls',
    source: project.locked ? { status: 'locked' } : sourceOf(module, streams, budget, dir.encoding),
  }));
  const controls = modules.flatMap((module) => controlsFor(module, streams, limits, dir.encoding));
  if (controls.length > limits.maxControls) {
    throw workbookTooLarge('form controls', limits.maxControls);
  }
  return {
    state: project.locked ? 'locked' : 'readable',
    ...(dir.projectName === '' ? {} : { name: dir.projectName }),
    codePage: dir.codePage,
    encoding: dir.encoding,
    modules,
    formControls: controls,
  };
}
