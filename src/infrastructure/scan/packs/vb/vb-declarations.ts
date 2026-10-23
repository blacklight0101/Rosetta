import type { PackSymbol } from '../../../../application/ports/language-pack.js';
import type { SymbolKind } from '../../../../domain/code-map/vocabulary.js';
import { RosettaError } from '../../../../domain/errors/rosetta-error.js';
import {
  codeOf,
  identifierOf,
  opensMultiLineLambda,
  startsAccessor,
  wordsOf,
  type Words,
} from './vb-lines.js';

// RF-111: classes, modules, structures, interfaces, enums, Subs, Functions and Properties of one
// VB.NET source, found line by line. Keywords are case-insensitive. Method and property bodies are
// skipped up to their own `End Sub`, `End Function` or `End Property`.

const maxDepth = 32;
const maxSymbols = 10_000;

type Block = 'namespace' | 'type' | 'enum' | 'method' | 'property';

const typeKinds = new Map<string, SymbolKind>([
  ['class', 'class'],
  ['module', 'class'],
  ['structure', 'struct'],
  ['interface', 'interface'],
]);

/** A symbol whose end line is set when its `End` line is read. */
interface OpenSymbol {
  readonly path: string;
  readonly kind: SymbolKind;
  readonly name: string;
  readonly startLine: number;
  endLine: number;
  readonly container?: string;
}

interface Frame {
  readonly block: Block;
  /** The word after `End` that closes it, lower case. */
  readonly endWord: string;
  /** Qualified name for a namespace or type; the member's own name otherwise. */
  readonly qualified: string;
  readonly isInterface: boolean;
  readonly symbol: OpenSymbol | undefined;
  /** Multi-line lambdas open inside a method body, whose `End` lines are not the method's. */
  lambdas: number;
}

function refuse(message: string): RosettaError {
  return new RosettaError('RST-1200', message);
}

const qualify = (scope: string | undefined, name: string): string =>
  scope === undefined ? name : `${scope}.${name}`;

class VbReader {
  private readonly symbols: OpenSymbol[] = [];
  private readonly stack: Frame[] = [];
  private readonly path: string;
  private readonly codes: readonly string[];
  private readonly firstLine: number;

  constructor(path: string, text: string, firstLine: number) {
    this.path = path;
    this.firstLine = firstLine;
    this.codes = text.split(/\r\n|\r|\n/u).map(codeOf);
  }

  read(): PackSymbol[] {
    this.codes.forEach((code, index) => {
      if (code !== '') this.line(code, this.firstLine + index, index);
    });
    // A block never closed runs to the end of the source.
    const lastLine = this.firstLine + this.codes.length - 1;
    while (this.stack.length > 0) this.pop(lastLine);
    return this.symbols;
  }

  private line(code: string, lineNumber: number, index: number): void {
    const words = wordsOf(code);
    const top = this.stack[this.stack.length - 1];
    if (top?.block === 'method' || top?.block === 'property') {
      this.inBody(top, code, words, lineNumber);
    } else if (top?.block === 'enum') {
      if (words.rest[0] === 'end' && words.rest[1] === 'enum') this.pop(lineNumber);
    } else if (words.rest[0] === 'end') {
      this.end(words.rest[1], lineNumber);
    } else {
      this.declaration(words, lineNumber, index);
    }
  }

  private inBody(top: Frame, code: string, words: Words, lineNumber: number): void {
    const closes = words.rest[0] === 'end' ? words.rest[1] : undefined;
    if (
      closes === top.endWord ||
      (top.lambdas > 0 && (closes === 'sub' || closes === 'function'))
    ) {
      // An `End Sub` or `End Function` closes the innermost open lambda before the member itself.
      if (top.lambdas > 0 && top.block === 'method') top.lambdas -= 1;
      else this.pop(lineNumber);
    } else if (top.block === 'method' && opensMultiLineLambda(code)) {
      top.lambdas += 1;
    }
  }

  private end(word: string | undefined, lineNumber: number): void {
    const at = this.stack.findLastIndex((frame) => frame.endWord === word);
    if (at < 0) return;
    while (this.stack.length > at) this.pop(lineNumber);
  }

  private pop(lineNumber: number): void {
    const frame = this.stack.pop();
    if (frame?.symbol !== undefined) frame.symbol.endLine = lineNumber;
  }

  private declaration(words: Words, lineNumber: number, index: number): void {
    const keyword = words.rest[0] ?? '';
    const name = identifierOf(words.original[1]);
    if (name === undefined) return;
    const scope = this.scope();
    if (keyword === 'sub' || keyword === 'function') {
      this.method(words, name, lineNumber, scope);
    } else if (keyword === 'property') {
      this.property(name, lineNumber, scope, index);
    } else {
      this.container(words, name, lineNumber, scope);
    }
  }

  /** A namespace, a type or an enum. */
  private container(words: Words, name: string, line: number, scope: string | undefined): void {
    const keyword = words.rest[0] ?? '';
    if (keyword === 'namespace') {
      this.open('namespace', keyword, qualify(scope, words.original[1] ?? name));
    } else if (keyword === 'enum' || typeKinds.has(keyword)) {
      const symbol = this.add(typeKinds.get(keyword) ?? 'enum', name, line, scope);
      this.open(keyword === 'enum' ? 'enum' : 'type', keyword, qualify(scope, name), symbol);
    }
  }

  private property(name: string, line: number, scope: string | undefined, index: number): void {
    const symbol = this.add('property', name, line, scope);
    if (!this.isInterface() && startsAccessor(this.nextCode(index))) {
      this.open('property', 'property', name, symbol);
    }
  }

  private method(words: Words, name: string, line: number, scope: string | undefined): void {
    const symbol = this.add(scope === undefined ? 'function' : 'method', name, line, scope);
    const closedOnLine = words.rest.length > 2 && words.rest.at(-2) === 'end';
    const bodiless =
      this.isInterface() ||
      closedOnLine ||
      words.modifiers.has('mustoverride') ||
      words.modifiers.has('partial');
    if (!bodiless) this.open('method', words.rest[0] ?? 'sub', name, symbol);
  }

  private scope(): string | undefined {
    return this.stack.findLast((f) => f.block === 'namespace' || f.block === 'type')?.qualified;
  }

  private isInterface(): boolean {
    return this.stack[this.stack.length - 1]?.isInterface === true;
  }

  /** The next line that holds code and is not an attribute line. */
  private nextCode(index: number): string {
    for (let next = index + 1; next < this.codes.length; next += 1) {
      const code = this.codes[next] ?? '';
      if (code !== '' && !code.startsWith('<')) return code;
    }
    return '';
  }

  private open(block: Block, endWord: string, qualified: string, symbol?: OpenSymbol): void {
    if (this.stack.length >= maxDepth) {
      throw refuse('Declarations are nested too deeply for the VB pack.');
    }
    const isInterface = endWord === 'interface';
    this.stack.push({ block, endWord, qualified, isInterface, symbol, lambdas: 0 });
  }

  private add(
    kind: SymbolKind,
    name: string,
    line: number,
    container: string | undefined,
  ): OpenSymbol {
    if (this.symbols.length >= maxSymbols) {
      throw refuse('The file has too many declarations for the VB pack.');
    }
    const symbol: OpenSymbol = {
      path: this.path,
      kind,
      name,
      startLine: line,
      endLine: line,
      ...(container === undefined ? {} : { container }),
    };
    this.symbols.push(symbol);
    return symbol;
  }
}

/**
 * The symbols of VB.NET source whose first line is `firstLine` (1 for a file, the script line for
 * a block of a web forms page). Members outside any type, as in a server script block, are
 * `function`s. Throws RST-1200 when the nesting or the symbol count passes its cap.
 */
export function readVbSymbols(path: string, text: string, firstLine = 1): PackSymbol[] {
  return new VbReader(path, text, firstLine).read();
}
