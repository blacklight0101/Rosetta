import mermaid from 'mermaid';
import { z } from 'zod';

// RF-508, P2-21: reads generated Mermaid text with the pinned Mermaid parser (a dev dependency,
// DEC-125) and returns what the parser saw: the nodes and edges, with Mermaid's entity codes
// decoded so a test can compare each label with the text it came from. The flowchart parser
// needs a DOM (DOMPurify), so a test that uses this runs in the happy-dom environment.

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

export interface ParsedNode {
  readonly id: string;
  readonly label: string;
}

export interface ParsedEdge {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  /** The arrow kind: the message type of a sequence, the cardinalities of a relation. */
  readonly kind: string;
}

export interface ParsedDiagram {
  readonly type: string;
  readonly nodes: readonly ParsedNode[];
  readonly edges: readonly ParsedEdge[];
}

/** Mermaid swaps `#59;` for a private marker before parsing and back to `&#59;` when drawing. */
export function decodeLabel(text: string): string {
  return text.replace(/ﬂ°°(\d+)¶ß/gu, (_match, digits: string) =>
    String.fromCodePoint(Number(digits)),
  );
}

function call(db: unknown, method: string): unknown {
  const fn: unknown = Reflect.get(Object(db), method);
  if (typeof fn !== 'function') throw new Error(`The diagram has no ${method}.`);
  const result: unknown = Reflect.apply(fn, db, []);
  return result;
}

const vertices = z.map(z.string(), z.object({ id: z.string(), text: z.string() }));
const links = z.array(z.object({ start: z.string(), end: z.string(), type: z.string() }));
const actors = z.map(z.string(), z.object({ name: z.string(), description: z.string() }));
const messages = z.array(
  z.object({ from: z.string(), to: z.string(), message: z.string(), type: z.number() }),
);
const attribute = z.object({
  type: z.string(),
  name: z.string(),
  keys: z.array(z.string()),
  comment: z.string(),
});
const entities = z.map(
  z.string(),
  z.object({ id: z.string(), alias: z.string(), attributes: z.array(attribute) }),
);
const relationships = z.array(
  z.object({
    entityA: z.string(),
    entityB: z.string(),
    roleA: z.string(),
    relSpec: z.object({ cardA: z.string(), relType: z.string(), cardB: z.string() }),
  }),
);

function flowchartOf(db: unknown): Omit<ParsedDiagram, 'type'> {
  const nodes = [...vertices.parse(call(db, 'getVertices')).values()];
  return {
    nodes: nodes.map((node) => ({ id: node.id, label: decodeLabel(node.text) })),
    edges: links
      .parse(call(db, 'getEdges'))
      .map((edge) => ({ from: edge.start, to: edge.end, label: '', kind: edge.type })),
  };
}

function sequenceOf(db: unknown): Omit<ParsedDiagram, 'type'> {
  const nodes = [...actors.parse(call(db, 'getActors')).values()];
  return {
    nodes: nodes.map((actor) => ({ id: actor.name, label: decodeLabel(actor.description) })),
    edges: messages.parse(call(db, 'getMessages')).map((message) => ({
      from: message.from,
      to: message.to,
      label: decodeLabel(message.message),
      kind: String(message.type),
    })),
  };
}

function entityOf(db: unknown): Omit<ParsedDiagram, 'type'> {
  const parsed = [...entities.parse(call(db, 'getEntities')).entries()];
  const nameOf = new Map(parsed.map(([name, entity]) => [entity.id, name]));
  const fields = parsed.flatMap(([name, entity]) =>
    entity.attributes.map((field) => ({
      id: `${name}.${field.type}.${field.name}`,
      label: `${field.keys.join(', ')}|${decodeLabel(field.comment)}`,
    })),
  );
  return {
    nodes: [
      ...parsed.map(([name, entity]) => ({ id: name, label: decodeLabel(entity.alias) })),
      ...fields,
    ],
    edges: relationships.parse(call(db, 'getRelationships')).map((relation) => ({
      from: nameOf.get(relation.entityA) ?? relation.entityA,
      to: nameOf.get(relation.entityB) ?? relation.entityB,
      label: decodeLabel(relation.roleA),
      kind: `${relation.relSpec.cardB}/${relation.relSpec.relType}/${relation.relSpec.cardA}`,
    })),
  };
}

/** Parses the text with Mermaid; throws when Mermaid refuses it. */
export async function parseDiagram(text: string): Promise<ParsedDiagram> {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- parse() answers only the diagram type; the parsed nodes and edges are reachable only through getDiagramFromText
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
  const readers: Readonly<Record<string, (db: unknown) => Omit<ParsedDiagram, 'type'>>> = {
    'flowchart-v2': flowchartOf,
    sequence: sequenceOf,
    er: entityOf,
  };
  const reader = readers[diagram.type];
  if (reader === undefined) throw new Error(`Unexpected diagram type ${diagram.type}.`);
  return { type: diagram.type, ...reader(diagram.db) };
}
