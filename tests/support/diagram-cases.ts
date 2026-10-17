import type {
  Cardinality,
  EntityModel,
  FieldKey,
} from '../../src/domain/diagrams/entity-diagram.js';
import { shown } from './hostile-names.js';
import type { ParsedDiagram, ParsedEdge, ParsedNode } from './mermaid-parse.js';

// RF-508, P2-21: one case of each diagram property test, built from hostile names, and what the
// Mermaid parser must read back from it. The expectations are written from the inputs, never from
// the generator's output. A name with `~` cannot be built from the hostile pieces, so a target or
// link that ends in `~` never names an existing card or route by chance.

export interface SequenceCase {
  readonly trigger: string;
  readonly outcome: string;
  readonly title: string;
  readonly first: string;
  readonly second: string;
  readonly third: string;
  readonly branch: string;
  readonly target: string;
}

export function sequenceCase(name: () => string): SequenceCase {
  return {
    trigger: name(),
    outcome: name(),
    title: name(),
    first: name(),
    second: name(),
    third: name(),
    branch: name(),
    target: `${name()}~`,
  };
}

const message = (from: string, to: string, label: string): ParsedEdge => ({
  from,
  to,
  label: shown(label),
  kind: '0',
});
const note = (on: string, label: string): ParsedEdge => ({
  from: on,
  to: on,
  label: shown(label),
  kind: '2',
});

export function expectedSequence(names: SequenceCase): ParsedDiagram {
  return {
    type: 'sequence',
    nodes: [
      { id: 'p1', label: shown(names.trigger) },
      { id: 'p2', label: shown(names.title) },
      { id: 'p3', label: shown(names.target) },
    ],
    edges: [
      message('p1', 'p2', `1. ${names.first}`),
      message('p2', 'p2', `2. ${names.second}`),
      message('p2', 'p3', `3. ${names.third}`),
      note('p3', `3.1 ${names.branch}`),
      note('p3', `Outcome: ${names.outcome}`),
    ],
  };
}

export interface ScreenCase {
  readonly first: string;
  readonly second: string;
  readonly missing: string;
}

export function screenCase(name: () => string): ScreenCase {
  return { first: name(), second: name(), missing: `${name()}~` };
}

export function expectedScreens(names: ScreenCase): ParsedDiagram {
  const link = (from: string, to: string): ParsedEdge => ({
    from,
    to,
    label: '',
    kind: 'arrow_point',
  });
  return {
    type: 'flowchart-v2',
    nodes: [
      { id: 's1', label: shown(names.first) },
      { id: 's2', label: shown(names.second) },
      { id: 's3', label: shown(names.missing) },
    ],
    edges: [link('s1', 's2'), link('s1', 's3'), link('s2', 's1')],
  };
}

const cardinalities: readonly Cardinality[] = [
  'one',
  'zero-or-one',
  'zero-or-more',
  'one-or-more',
  'unknown',
];

export interface EntityCase {
  readonly names: readonly string[];
  readonly from: Cardinality;
  readonly to: Cardinality;
  readonly model: EntityModel;
}

/** Names: two entities, a typed key field, a plain field, the relation label, a missing entity. */
export function entityCase(name: () => string, run: number): EntityCase {
  const names = Array.from({ length: 6 }, name);
  const at = (index: number): string => names[index] ?? '';
  const from = cardinalities[run % cardinalities.length] ?? 'one';
  const to = cardinalities[(run * 3 + 1) % cardinalities.length] ?? 'one';
  const missing = `${name()}~`;
  const keys: readonly FieldKey[] = ['PK'];
  const typed = { name: at(2), type: at(3), keys };
  return {
    names: [...names, missing],
    from,
    to,
    model: {
      entities: [
        { cardId: 'ENT-001', name: at(0), fields: [typed, { name: at(4) }] },
        { cardId: 'ENT-002', name: at(1), fields: [] },
      ],
      relations: [
        { from: 'ENT-001', to: 'ENT-002', label: at(5), fromCardinality: from, toCardinality: to },
        { from: 'ENT-002', to: missing, label: '', fromCardinality: 'one', toCardinality: 'one' },
      ],
    },
  };
}

export function expectedEntities(entity: EntityCase): readonly ParsedNode[] {
  const at = (index: number): string => entity.names[index] ?? '';
  return [
    { id: 'e1', label: shown(at(0)) },
    { id: 'e2', label: shown(at(1)) },
    { id: 'e3', label: shown(at(6)) },
    { id: 'e1.field.f1', label: `PK|${shown(`${at(2)}: ${at(3)}`)}` },
    { id: 'e1.field.f2', label: `|${shown(at(4))}` },
  ];
}

const mermaidCardinality: Readonly<Record<Cardinality, string>> = {
  one: 'ONLY_ONE',
  'zero-or-one': 'ZERO_OR_ONE',
  'zero-or-more': 'ZERO_OR_MORE',
  'one-or-more': 'ONE_OR_MORE',
  unknown: 'ZERO_OR_MORE',
};

function kindOf(from: Cardinality, to: Cardinality): string {
  const line = from === 'unknown' || to === 'unknown' ? 'NON_IDENTIFYING' : 'IDENTIFYING';
  return `${mermaidCardinality[from]}/${line}/${mermaidCardinality[to]}`;
}

export function expectedRelations(entity: EntityCase): readonly ParsedEdge[] {
  const role = entity.names[5] ?? '';
  const unknown = entity.from === 'unknown' || entity.to === 'unknown';
  return [
    {
      from: 'e1',
      to: 'e2',
      label: shown(unknown ? `${role} (cardinality unknown)` : role),
      kind: kindOf(entity.from, entity.to),
    },
    { from: 'e2', to: 'e3', label: ' ', kind: kindOf('one', 'one') },
  ];
}
