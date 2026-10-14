import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

// RF-1104, threat model TB5: where a class is constructed. The scan reads the syntax tree, so a
// mention in a comment, a string or a type position does not count; only `new <Name>(...)`.

/** True when the source text constructs `className` with `new` somewhere. */
export function constructs(source: string, className: string): boolean {
  const tree = ts.createSourceFile('file.ts', source, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === className
    )
      found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

/** The files under `folder` (paths relative to `base`, forward slashes) that construct `className`. */
export async function filesConstructing(
  base: string,
  folder: string,
  className: string,
): Promise<string[]> {
  const root = join(base, folder);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const hits: string[] = [];
  for (const entry of entries.filter((e) => e.isFile() && e.name.endsWith('.ts'))) {
    const path = join(entry.parentPath, entry.name);
    if (constructs(await readFile(path, 'utf8'), className)) {
      hits.push(relative(base, path).split(sep).join('/'));
    }
  }
  return hits.sort();
}
