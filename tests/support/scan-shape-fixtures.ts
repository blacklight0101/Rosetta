import type {
  ReadBytesRequest,
  RepositoryReader,
} from '../../src/application/ports/repository-reader.js';
import type { ScannedSource, ScanResults } from '../../src/application/ports/scan-results.js';
import type { CodeMap } from '../../src/domain/code-map/code-map.js';
import type { FileEntry } from '../../src/domain/code-map/file-entry.js';
import { err, ok } from '../../src/domain/errors/result.js';
import type { Run } from '../../src/domain/runs/run.js';
import { languageByExtension } from '../../src/infrastructure/scan/universal/language-table.js';
import { entry } from './code-map-builders.js';

// RF-632: a fixture scan for the shapes of the data: files of every kind the package measures
// (source, configuration, generated maps, bundled scripts, a binary, a file too large to be read),
// held in memory, and a reader that answers `readBytes` and lists the names it refused. The layout
// imitates a WebForms demo application with a `Scripts/` folder of bundled libraries and their maps.

/** A file's content: its text, its bytes, or only its size (a file too large to be read). */
export type FixtureContent = string | Uint8Array | { readonly size: number };

export interface ScanFixture {
  readonly codeMap: Pick<CodeMap, 'files'>;
  readonly reader: Pick<RepositoryReader, 'readBytes' | 'skippedPaths'>;
  /** The paths `readBytes` was asked for, in order. */
  readonly asked: string[];
}

function isSizeOnly(content: FixtureContent): content is { readonly size: number } {
  return typeof content === 'object' && 'size' in content;
}

function bytesOf(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? new TextEncoder().encode(content) : content;
}

function languageOf(path: string): string {
  const name = path.split('/').pop() ?? '';
  return languageByExtension.get(name.split('.').pop()?.toLowerCase() ?? '') ?? 'unknown';
}

function entryOf(path: string, content: FixtureContent): FileEntry {
  const language = languageOf(path);
  if (isSizeOnly(content)) return entry(path, 0, { language, lines: 0, skipped: 'too-large' });
  const bytes = bytesOf(content);
  if (bytes.includes(0)) return entry(path, 0, { language, lines: 0, skipped: 'binary' });
  const text = new TextDecoder().decode(bytes);
  const lines = Math.max(1, text.split('\n').length - (text.endsWith('\n') ? 1 : 0));
  return entry(path, Math.ceil(text.length / 4), { language, lines });
}

// RF-632
export function scanOf(
  contents: Readonly<Record<string, FixtureContent>>,
  options: {
    readonly invalidNames?: readonly string[];
    readonly unreadable?: readonly string[];
  } = {},
): ScanFixture {
  const asked: string[] = [];
  const unreadable = new Set(options.unreadable ?? []);
  const files = Object.entries(contents).map(([path, content]) => entryOf(path, content));
  return {
    codeMap: { files },
    asked,
    reader: {
      skippedPaths: { links: [], invalidNames: options.invalidNames ?? [] },
      readBytes: ({ path, maxBytes }) => {
        asked.push(path);
        const content = contents[path];
        if (content === undefined || unreadable.has(path)) {
          return Promise.resolve(
            err({ code: 'RST-1104', reason: 'not-found', message: 'No such file.' }),
          );
        }
        if (isSizeOnly(content))
          return Promise.resolve(ok({ path, sizeBytes: content.size, bytes: undefined }));
        const bytes = bytesOf(content);
        const read = bytes.length > maxBytes ? undefined : bytes;
        return Promise.resolve(ok({ path, sizeBytes: bytes.length, bytes: read }));
      },
    },
  };
}

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const repeat = (line: string, times: number): string => line.repeat(times);
const withBom = (text: string): Uint8Array =>
  bytes(0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text));

/** The demo application's scan: bundled libraries with maps, CRLF configuration, odd names. */
export function demoScan(): ScanFixture {
  return scanOf(
    {
      'Catalog/Default.aspx': repeat('<div>catalog</div>\r\n', 40),
      'Catalog/Default.aspx.cs': repeat('// code\n', 120),
      'Catalog/Services/CatalogService.cs': repeat('// service\n', 300),
      'Web.config': withBom(repeat('<add key="a" />\r\n', 30)),
      'Scripts/jquery-3.4.1.min.js': repeat('function a(){return 1};'.repeat(30), 90),
      'Scripts/jquery-3.4.1.min.map': repeat('{"mappings":"AAAA"}'.repeat(30), 270),
      'Scripts/bootstrap.bundle.js': repeat('// bootstrap line of code\n', 4000),
      'Scripts/bootstrap.bundle.js.map': repeat('{"mappings":"AAAA"}'.repeat(30), 150),
      'Content/site.css.map': repeat('{"mappings":"AAAA"}', 60),
      'Docs/legacy-notes.txt': bytes(
        0x63,
        0x61,
        0x66,
        0xe9,
        0x0a,
        0x6f,
        0x72,
        0x64,
        0x65,
        0x72,
        0x0a,
      ),
      'Images/logo.png': bytes(0x89, 0x50, 0x4e, 0x47, 0x00, 0x00),
      'Archive/old-export.csv': { size: 12_345_678 },
      'Orders/Legacy/Archive/2009/Q4/Regional/North/Totals.cs': repeat('// totals\r\n', 50),
      'Orders/Report.cs': 'class Report { }',
    },
    { invalidNames: ['Orders/aux.c', 'Orders/Con.txt'] },
  );
}

const refusal = { code: 'RST-1104', reason: 'not-found', message: 'No such file.' } as const;

/** A full reader over a fixture scan: bytes and refused names, nothing else is readable. */
class FixtureReader implements RepositoryReader {
  readonly liftedDenyPatterns: readonly string[] = [];
  readonly subpath = '';
  readonly skippedPaths: RepositoryReader['skippedPaths'];
  private readonly scan: ScanFixture;

  constructor(scan: ScanFixture) {
    this.scan = scan;
    this.skippedPaths = scan.reader.skippedPaths;
  }

  listFiles(): Promise<readonly string[]> {
    return Promise.resolve(this.scan.codeMap.files.map((file) => file.path));
  }

  readLines(): ReturnType<RepositoryReader['readLines']> {
    return Promise.resolve(err(refusal));
  }

  grep(): ReturnType<RepositoryReader['grep']> {
    return Promise.resolve(err(refusal));
  }

  readBytes(request: ReadBytesRequest): ReturnType<RepositoryReader['readBytes']> {
    return this.scan.reader.readBytes(request);
  }
}

/** The scan results of a project whose scan is this fixture. */
export class FixtureScans implements ScanResults {
  readonly opened: Run[] = [];
  private readonly scan: ScanFixture;
  private readonly workbookFolders: readonly string[];

  constructor(scan: ScanFixture, workbookFolders: readonly string[] = []) {
    this.scan = scan;
    this.workbookFolders = workbookFolders;
  }

  open(run: Run): Promise<ScannedSource> {
    this.opened.push(run);
    const { files } = this.scan.codeMap;
    return Promise.resolve({
      codeMap: {
        schemaVersion: 1,
        source: { owner: 'octo', repo: 'demo', commitSha: 'c'.repeat(40), subpath: '' },
        ...{ files, areas: [], symbols: [], links: [], sqlStatements: [], entities: [] },
        languagePacks: [],
      },
      codeMapHash: 'a'.repeat(64),
      reader: new FixtureReader(this.scan),
      source: {
        commitSha: 'c'.repeat(40),
        snapshotKey: run.snapshotKey ?? 'octo__demo',
        snapshotHash: `sha256:${'b'.repeat(64)}`,
      },
      ...(this.workbookFolders.length === 0 ? {} : { workbookFolders: this.workbookFolders }),
    });
  }
}
