import { createRequire } from 'node:module';
import { Language, Parser } from 'web-tree-sitter';

// ADR-004: web-tree-sitter runs the grammar as WebAssembly, so Windows needs no native build. The
// grammar file ships inside the `tree-sitter-c-sharp` package and is found through Node's resolver.

const grammarFile = 'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm';

let runtime: Promise<void> | undefined;

/** Starts the WebAssembly runtime once per process; a failed start can be retried. */
function startRuntime(): Promise<void> {
  runtime ??= Parser.init().catch((error: unknown) => {
    runtime = undefined;
    throw error;
  });
  return runtime;
}

/** A parser set to the C# grammar. */
export async function createCSharpParser(): Promise<Parser> {
  await startRuntime();
  const language = await Language.load(createRequire(import.meta.url).resolve(grammarFile));
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
