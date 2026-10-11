import type { Node } from 'web-tree-sitter';
import type { PackEntity, PackSymbol } from '../../../../application/ports/language-pack.js';
import type { SymbolKind } from '../../../../domain/code-map/vocabulary.js';
import { RosettaError } from '../../../../domain/errors/rosetta-error.js';

// RF-111: types, methods and properties of one C# syntax tree, and the entity sets of an Entity
// Framework context. Only declarations are visited, never method bodies, so the walk is as deep as
// the nesting of namespaces and types, which is capped.

const maxDepth = 32;
const maxSymbols = 10_000;
const maxNameCharacters = 200;

const typeKinds = new Map<string, SymbolKind>([
  ['class_declaration', 'class'],
  ['interface_declaration', 'interface'],
  ['struct_declaration', 'struct'],
  ['enum_declaration', 'enum'],
  ['record_declaration', 'class'],
  ['record_struct_declaration', 'struct'],
]);
const memberKinds = new Map<string, SymbolKind>([
  ['method_declaration', 'method'],
  ['property_declaration', 'property'],
]);
const entitySetTypes = new Set(['DbSet', 'IDbSet']);

export interface Declarations {
  readonly symbols: readonly PackSymbol[];
  readonly entities: readonly PackEntity[];
}

interface Scope {
  /** Qualified name of the enclosing namespace or type. */
  readonly name: string | undefined;
  /** True inside a class that derives from a `*DbContext`. */
  readonly dbContext: boolean;
}

function refuse(message: string): RosettaError {
  return new RosettaError('RST-1200', message);
}

function nameOf(node: Node): string | undefined {
  const text = node.childForFieldName('name')?.text;
  return text === undefined || text === '' ? undefined : text.slice(0, maxNameCharacters);
}

function qualify(scope: string | undefined, name: string): string {
  return scope === undefined ? name : `${scope}.${name}`;
}

/** `Foo`, `Foo<T>` and `A.B.Foo<T>` all give `Foo`. */
function simpleName(node: Node): string {
  if (node.type === 'identifier') return node.text;
  if (node.type === 'qualified_name') {
    const name = node.childForFieldName('name');
    return name === null ? '' : simpleName(name);
  }
  if (node.type === 'generic_name') {
    const first = node.namedChildren.find((child) => child.type === 'identifier');
    return first?.text ?? '';
  }
  return '';
}

function derivesFromDbContext(declaration: Node): boolean {
  const bases = declaration.namedChildren.find((child) => child.type === 'base_list');
  return bases?.namedChildren.some((base) => simpleName(base).endsWith('DbContext')) ?? false;
}

/** The `T` of a property typed `DbSet<T>` or `IDbSet<T>`, with or without a namespace. */
function entitySetOf(property: Node): string | undefined {
  const type = property.childForFieldName('type');
  const generic = type?.type === 'qualified_name' ? type.childForFieldName('name') : type;
  if (generic?.type !== 'generic_name' || !entitySetTypes.has(simpleName(generic))) {
    return undefined;
  }
  const argument = generic.namedChildren.find((child) => child.type === 'type_argument_list');
  return argument?.namedChildren[0]?.text.slice(0, maxNameCharacters);
}

class DeclarationWalker {
  readonly symbols: PackSymbol[] = [];
  readonly entities: PackEntity[] = [];

  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  visit(container: Node, scope: Scope, depth: number): void {
    if (depth > maxDepth) throw refuse('Declarations are nested too deeply for the C# pack.');
    let current = scope;
    for (const child of container.namedChildren) {
      if (child.type === 'file_scoped_namespace_declaration') {
        current = this.namespaceScope(child, scope);
      } else if (child.type === 'namespace_declaration') {
        this.descend(child, this.namespaceScope(child, scope), depth);
      } else if (typeKinds.has(child.type)) {
        this.visitType(child, current, depth);
      } else if (memberKinds.has(child.type)) {
        this.visitMember(child, current);
      } else if (child.type.startsWith('preproc_')) {
        this.visit(child, current, depth + 1);
      }
    }
  }

  private namespaceScope(node: Node, scope: Scope): Scope {
    const name = nameOf(node);
    return name === undefined ? scope : { ...scope, name: qualify(scope.name, name) };
  }

  private descend(node: Node, scope: Scope, depth: number): void {
    const body = node.childForFieldName('body');
    if (body !== null) this.visit(body, scope, depth + 1);
  }

  private visitType(node: Node, scope: Scope, depth: number): void {
    const name = nameOf(node);
    const kind = typeKinds.get(node.type);
    if (name === undefined || kind === undefined) return;
    this.push(node, kind, name, scope.name);
    this.descend(
      node,
      { name: qualify(scope.name, name), dbContext: derivesFromDbContext(node) },
      depth,
    );
  }

  private visitMember(node: Node, scope: Scope): void {
    const name = nameOf(node);
    const kind = memberKinds.get(node.type);
    if (name === undefined || kind === undefined) return;
    this.push(node, kind, name, scope.name);
    const entity = scope.dbContext && kind === 'property' ? entitySetOf(node) : undefined;
    if (entity === undefined) return;
    this.entities.push({
      name: entity,
      path: this.path,
      startLine: node.startPosition.row + 1,
      source: qualify(scope.name, name),
    });
  }

  private push(node: Node, kind: SymbolKind, name: string, container: string | undefined): void {
    if (this.symbols.length >= maxSymbols)
      throw refuse('The file has too many declarations for the C# pack.');
    this.symbols.push({
      path: this.path,
      kind,
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      ...(container === undefined ? {} : { container }),
    });
  }
}

/** Throws RST-1200 when the tree nests deeper or holds more declarations than the caps allow. */
export function collectDeclarations(root: Node, path: string): Declarations {
  const walker = new DeclarationWalker(path);
  walker.visit(root, { name: undefined, dbContext: false }, 0);
  return { symbols: walker.symbols, entities: walker.entities };
}
