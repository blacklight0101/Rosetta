import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

// ADR-016, RNF-003, P1-49 F-20: SQL travels as a constant string and a values array, never as a
// template literal with `${}` substitutions. The scan reads a source file as a syntax tree, so a
// template is found wherever it sits: in the first argument of `query(`, in a helper that returns
// SQL, nested in another template, or behind a tag. A `$1` placeholder is part of the text, not a
// substitution, and is never flagged.

/** Shapes of SQL text, in any letter case; `\s` also matches line breaks and Unicode spaces. */
const SQL_SHAPES: readonly RegExp[] = [
  /\bselect\b[\s\S]*\bfrom\b/iu,
  /\binsert\s+into\b/iu,
  /\bupdate\s+[\w."]+\s+set\b/iu,
  /\bdelete\s+from\b/iu,
  /\b(?:create|alter|drop|truncate)\s+(?:or\s+replace\s+)?(?:table|index|role|schema|function|view|type|extension|trigger|sequence|user)\b/iu,
  /\b(?:grant|revoke)\b[\s\S]*\b(?:to|from|on)\b/iu,
  /\b(?:truncate|vacuum|reindex)\b/iu,
  /\block\s+table\b/iu,
  /\bcomment\s+on\b/iu,
  /\bwhere\b/iu,
  /\b(?:order|group)\s+by\b/iu,
  /\bvalues\s*\(/iu,
  /\bon\s+conflict\b/iu,
  /\breturning\b/iu,
  /\bset\s+(?:local\s+)?(?:role|search_path)\b/iu,
];

export interface SqlTemplateFinding {
  readonly line: number;
  readonly kind: 'sql-text' | 'tagged' | 'query-argument';
  readonly text: string;
}

function staticText(node: ts.TemplateExpression): string {
  return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ');
}

function isQueryArgument(node: ts.Node): boolean {
  const call = node.parent;
  if (!ts.isCallExpression(call) || call.arguments[0] !== node) return false;
  const callee = call.expression;
  return (
    (ts.isIdentifier(callee) && callee.text === 'query') ||
    (ts.isPropertyAccessExpression(callee) && callee.name.text === 'query') ||
    (ts.isElementAccessExpression(callee) &&
      ts.isStringLiteralLike(callee.argumentExpression) &&
      callee.argumentExpression.text === 'query')
  );
}

function classify(node: ts.Node): SqlTemplateFinding['kind'] | undefined {
  if (ts.isTaggedTemplateExpression(node) && ts.isTemplateExpression(node.template))
    return 'tagged';
  if (!ts.isTemplateExpression(node)) return undefined;
  if (isQueryArgument(node)) return 'query-argument';
  return SQL_SHAPES.some((shape) => shape.test(staticText(node))) ? 'sql-text' : undefined;
}

/** Every template literal with a substitution that builds SQL, with its line and kind. */
export function findSqlTemplates(source: string, fileName = 'file.ts'): SqlTemplateFinding[] {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: SqlTemplateFinding[] = [];
  const visit = (node: ts.Node): void => {
    const kind = classify(node);
    if (kind !== undefined) {
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      found.push({ line, kind, text: node.getText(tree).slice(0, 80) });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;

/** "<relative path>:<line> <kind>" for every finding in the source files under `folder`, sorted. */
export async function scanFolder(folder: string): Promise<{ files: number; found: string[] }> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name));
  const found = (
    await Promise.all(
      files.map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        const findings = findSqlTemplates(await readFile(path, 'utf8'), path);
        const name = relative(folder, path).split(sep).join('/');
        return findings.map((finding) => `${name}:${String(finding.line)} ${finding.kind}`);
      }),
    )
  ).flat();
  return { files: files.length, found: found.sort() };
}
