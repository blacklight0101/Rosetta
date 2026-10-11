import type {
  LanguagePack,
  PackAnalysis,
  PackEntity,
  PackFile,
  PackReference,
  PackRoute,
  PackSymbol,
} from '../../src/application/ports/language-pack.js';

export interface TestLanguagePackOptions {
  readonly name?: string;
  readonly extensions?: readonly string[];
  /** A file whose path satisfies this makes `analyse` throw. */
  readonly failOn?: (path: string) => boolean;
}

/**
 * RF-110: a pack for the interface tests. Its "language" is one directive per line:
 * `type <Name>`, `fn <Name>`, `uses <path>`, `route <METHOD> <template>`, `entity <Name>`;
 * a line `boom` makes the pack throw, with a message that holds the line's text.
 */
export class TestLanguagePack implements LanguagePack {
  readonly name: string;
  readonly version = '1.0.0';
  readonly extensions: readonly string[];
  private readonly failOn: (path: string) => boolean;

  constructor(options: TestLanguagePackOptions = {}) {
    this.name = options.name ?? 'test';
    this.extensions = options.extensions ?? ['.tst'];
    this.failOn = options.failOn ?? (() => false);
  }

  analyse(file: PackFile): PackAnalysis {
    if (this.failOn(file.path)) throw new Error(`cannot read ${file.path}`);
    const symbols: PackSymbol[] = [];
    const references: PackReference[] = [];
    const routes: PackRoute[] = [];
    const entities: PackEntity[] = [];
    file.text.split('\n').forEach((line, index) => {
      const [word = '', first = '', ...rest] = line.trim().split(' ');
      const lineNumber = index + 1;
      if (word === 'boom') throw new Error(`boom: ${line}`);
      if (word === 'type' || word === 'fn') {
        const kind = word === 'type' ? 'class' : 'function';
        symbols.push({
          path: file.path,
          kind,
          name: first,
          startLine: lineNumber,
          endLine: lineNumber,
        });
      }
      if (word === 'uses') {
        references.push({ from: file.path, to: first, kind: 'import' });
      }
      if (word === 'route') {
        routes.push({
          path: file.path,
          startLine: lineNumber,
          method: first,
          template: rest.join(' '),
        });
      }
      if (word === 'entity') {
        entities.push({ name: first, path: file.path, startLine: lineNumber, source: 'test' });
      }
    });
    return { symbols, references, routes, entities };
  }
}
