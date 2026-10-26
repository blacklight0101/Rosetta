import type { ScanResults, ScannedSource } from '../../src/application/ports/scan-results.js';
import type { CodeMap } from '../../src/domain/code-map/code-map.js';
import type { FileEntry } from '../../src/domain/code-map/file-entry.js';
import type { Run } from '../../src/domain/runs/run.js';
import { demoScan, FixtureScans } from './scan-shape-fixtures.js';

// P5-39: scan results whose code map holds exactly these files, for the proposals of a plan run.

function fileOf(path: string, language: string, kinds: FileEntry['artefactKinds'] = []): FileEntry {
  return {
    ...{ path, language, lines: 100, estimatedTokens: 100, sha256: 'a'.repeat(64) },
    ...{ artefactKinds: kinds, mapLevel: 'coarse' },
  };
}

export class ProposalScans implements ScanResults {
  private readonly inner = new FixtureScans(demoScan());
  private readonly files: readonly FileEntry[];
  private readonly sql: CodeMap['sqlStatements'];

  constructor(files: readonly FileEntry[], sql: CodeMap['sqlStatements'] = []) {
    this.files = files;
    this.sql = sql;
  }

  async open(run: Run): Promise<ScannedSource> {
    const opened = await this.inner.open(run);
    return {
      ...opened,
      codeMap: { ...opened.codeMap, files: this.files, sqlStatements: this.sql },
    };
  }
}

export const webFormsFiles: readonly FileEntry[] = [
  fileOf('Web/Default.aspx', 'aspnet', ['page']),
  fileOf('Web/Default.aspx.cs', 'csharp'),
  fileOf('Web/Default.aspx.designer.cs', 'csharp'),
];

export const winFormsFiles: readonly FileEntry[] = [
  fileOf('App/MainInterface.cs', 'csharp'),
  fileOf('App/MainInterface.Designer.cs', 'csharp'),
  fileOf('App/Program.cs', 'csharp', ['entry-point']),
];

export const oneStatement: CodeMap['sqlStatements'] = [
  { path: 'App/MainInterface.cs', line: 3, verb: 'SELECT', text: 'SELECT 1' },
];
