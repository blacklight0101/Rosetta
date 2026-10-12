import type { Parser } from 'web-tree-sitter';
import type {
  LanguagePack,
  PackAnalysis,
  PackFile,
} from '../../../../application/ports/language-pack.js';
import { RosettaError } from '../../../../domain/errors/rosetta-error.js';
import { collectDeclarations } from './csharp-declarations.js';
import { createCSharpParser } from './csharp-grammar.js';
import { codeBehindReference } from './webforms-directive.js';

// RF-111, ADR-004: the C# pack. C# files are parsed with tree-sitter; WebForms pages only have their
// directive read. Both caps below keep one hostile file from costing the scan more than a moment;
// the scan-wide parse budget (P1-75) also stops a parse through `PackFile.shouldStop`.

const maxSourceCharacters = 2_000_000;
const defaultParseBudgetMs = 5000;
const webFormsExtensions = ['.aspx', '.ascx', '.master'];

export interface CSharpPackOptions {
  /** How long one parse may run before it is stopped. */
  readonly parseBudgetMs?: number;
}

const empty: PackAnalysis = { symbols: [], references: [], routes: [], entities: [] };

function isWebFormsPage(path: string): boolean {
  const lower = path.toLowerCase();
  return webFormsExtensions.some((extension) => lower.endsWith(extension));
}

export class CSharpPack implements LanguagePack {
  readonly name = 'csharp';
  /** Raise when the output for a file can change. */
  readonly version = '1.0.0';
  readonly extensions = ['.cs', ...webFormsExtensions];

  private readonly parser: Parser;
  private readonly parseBudgetMs: number;

  private constructor(parser: Parser, parseBudgetMs: number) {
    this.parser = parser;
    this.parseBudgetMs = parseBudgetMs;
  }

  /** Loads the WebAssembly grammar from the `tree-sitter-c-sharp` package. */
  static async create(options: CSharpPackOptions = {}): Promise<CSharpPack> {
    return new CSharpPack(
      await createCSharpParser(),
      options.parseBudgetMs ?? defaultParseBudgetMs,
    );
  }

  analyse(file: PackFile): PackAnalysis {
    if (file.text.length > maxSourceCharacters) {
      throw new RosettaError('RST-1200', 'The file is too large for the C# pack.');
    }
    if (isWebFormsPage(file.path)) {
      const reference = codeBehindReference(file.path, file.text);
      return reference === undefined ? empty : { ...empty, references: [reference] };
    }
    return this.analyseCode(file);
  }

  private analyseCode(file: PackFile): PackAnalysis {
    const deadline = Date.now() + this.parseBudgetMs;
    const tree = this.parser.parse(file.text, null, {
      progressCallback: () => Date.now() > deadline || file.shouldStop?.() === true,
    });
    if (tree === null) {
      // A halted parse resumes on the next call unless the parser is reset; the next file must start
      // from nothing, not from the text of this one.
      this.parser.reset();
      throw new RosettaError('RST-1200', 'Parsing the file took too long.');
    }
    try {
      // A tree with errors would give partial data under map level `symbols`; the file stays coarse.
      if (tree.rootNode.hasError) {
        throw new RosettaError('RST-1200', 'The file has syntax errors the C# pack cannot map.');
      }
      const { symbols, entities } = collectDeclarations(tree.rootNode, file.path);
      return { ...empty, symbols, entities };
    } finally {
      tree.delete();
    }
  }
}
