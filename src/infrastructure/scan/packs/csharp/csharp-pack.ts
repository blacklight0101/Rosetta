import type { Parser } from 'web-tree-sitter';
import type {
  LanguagePack,
  PackAnalysis,
  PackEntity,
  PackFile,
  PackSymbol,
} from '../../../../application/ports/language-pack.js';
import type { PageMarkup } from '../../../../domain/cards/page-markup.js';
import { RosettaError } from '../../../../domain/errors/rosetta-error.js';
import { readVbSymbols } from '../vb/vb-declarations.js';
import { collectDeclarations, type Declarations } from './csharp-declarations.js';
import { createCSharpParser } from './csharp-grammar.js';
import { codeBehindReference, pageLanguage } from './webforms-directive.js';
import { webFormsMarkup } from './webforms-markup.js';
import { serverScriptBlocks, type ScriptBlock } from './webforms-script.js';

// RF-111, ADR-004: the C# pack. C# files are parsed with tree-sitter; WebForms pages have their
// directive read and their `<script runat="server">` blocks scanned with the page language (a C#
// block is parsed inside a synthetic class, a VB block by the VB reader). Both caps below keep one hostile file from costing the scan more than a moment;
// the scan-wide parse budget (P1-75) also stops a parse through `PackFile.shouldStop`.

const maxSourceCharacters = 2_000_000;
const defaultParseBudgetMs = 5000;
/** Wraps a C# script block so its members parse; the wrapper stays on the block's first line. */
const scriptClass = '__RosettaPage';
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
  readonly version = '1.2.0';
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
      return this.analyseWebForm(file);
    }
    return this.analyseCode(file);
  }

  /** P5-31: the fields, buttons and links of a WebForms page, with their lines. */
  pageMarkup(file: PackFile): PageMarkup | undefined {
    if (file.text.length > maxSourceCharacters) return undefined;
    return webFormsMarkup(file.path, file.text);
  }

  private analyseWebForm(file: PackFile): PackAnalysis {
    const reference = codeBehindReference(file.path, file.text);
    const language = pageLanguage(file.text);
    const symbols: PackSymbol[] = [];
    const entities: PackEntity[] = [];
    for (const block of language === 'other' ? [] : serverScriptBlocks(file.text)) {
      try {
        const found =
          language === 'vb'
            ? { symbols: readVbSymbols(file.path, block.text, block.startLine), entities: [] }
            : this.analyseScript(file, block);
        symbols.push(...found.symbols);
        entities.push(...found.entities);
      } catch (error) {
        // One block the pack cannot map must not cost the page its other blocks or its link; a
        // stop from the scan-wide budget is not that, and goes on to the runner.
        if (file.shouldStop?.() === true || !(error instanceof RosettaError)) throw error;
      }
    }
    return { ...empty, symbols, entities, references: reference === undefined ? [] : [reference] };
  }

  /** The declarations of a C# script block, on the lines of the page and without the wrapper. */
  private analyseScript(file: PackFile, block: ScriptBlock): Declarations {
    const wrapped = `class ${scriptClass}{${block.text}
}`;
    const found = this.parseDeclarations(file.path, wrapped, file.shouldStop);
    const shift = block.startLine - 1;
    const unwrap = (name: string): string | undefined =>
      name === scriptClass ? undefined : name.replace(`${scriptClass}.`, '');
    return {
      symbols: found.symbols
        .filter((symbol) => symbol.name !== scriptClass)
        .map(({ container, ...symbol }) => {
          const inner = container === undefined ? undefined : unwrap(container);
          return {
            ...symbol,
            kind: symbol.kind === 'method' && inner === undefined ? 'function' : symbol.kind,
            startLine: symbol.startLine + shift,
            endLine: symbol.endLine + shift,
            ...(inner === undefined ? {} : { container: inner }),
          };
        }),
      entities: found.entities.map((entity) => ({
        ...entity,
        startLine: entity.startLine + shift,
        source: unwrap(entity.source) ?? entity.source,
      })),
    };
  }

  private analyseCode(file: PackFile): PackAnalysis {
    const { symbols, entities } = this.parseDeclarations(file.path, file.text, file.shouldStop);
    return { ...empty, symbols, entities };
  }

  private parseDeclarations(
    path: string,
    text: string,
    shouldStop: (() => boolean) | undefined,
  ): Declarations {
    const deadline = Date.now() + this.parseBudgetMs;
    const tree = this.parser.parse(text, null, {
      progressCallback: () => Date.now() > deadline || shouldStop?.() === true,
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
      return collectDeclarations(tree.rootNode, path);
    } finally {
      tree.delete();
    }
  }
}
