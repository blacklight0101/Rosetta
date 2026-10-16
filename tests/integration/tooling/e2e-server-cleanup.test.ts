import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// RNF-005, P1-165: the end-to-end server clears its data folder with the helper that makes read-only
// snapshot trees writable first, at start-up and on shutdown. The server needs a database, so this
// reads its syntax tree: a plain `rm` or `rmSync` of the folder would leave a read-only tree behind.

const serverFile = new URL('../../e2e/support/serve.ts', import.meta.url);

async function parse(): Promise<ts.SourceFile> {
  const text = await readFile(serverFile, 'utf8');
  return ts.createSourceFile('serve.ts', text, ts.ScriptTarget.Latest, true);
}

function callsOf(tree: ts.SourceFile, name: string): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    ) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

describe('end-to-end server data folder', () => {
  it('RNF-005 clears the data folder with removeWritableTree at start-up and on shutdown', async () => {
    const tree = await parse();

    const calls = callsOf(tree, 'removeWritableTree');

    expect(calls.map((call) => call.arguments[0]?.getText(tree))).toEqual(['dataDir', 'dataDir']);
  });

  it('RNF-005 never removes a folder with a plain rm', async () => {
    const tree = await parse();

    expect(callsOf(tree, 'rm')).toEqual([]);
    expect(callsOf(tree, 'rmSync')).toEqual([]);
  });
});
