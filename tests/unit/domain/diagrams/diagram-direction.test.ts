// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { entityDiagram, type Cardinality } from '../../../../src/domain/diagrams/entity-diagram.js';
import { screenMapDiagram } from '../../../../src/domain/diagrams/screen-map.js';
import { screenCard } from '../../../support/diagram-fixtures.js';
import { parseDiagram } from '../../../support/mermaid-parse.js';

// RF-508 (P2-21 fix round 1): the Mermaid 12.1 flowchart and erDiagram lexers match a
// `direction` statement anywhere in a line, inside quotes too, and drop the rest of the line
// without an error. These names once made a node or a relation vanish; parsed with the pinned
// parser, each must now keep its node, label and links.

const names = [
  'redirection BTN',
  'Field direction TB, see notes',
  'direction  LR',
  'direction TD',
  'Sort direction lr',
  'direction tbd',
  'Text DIRECTION Rlx',
  'direction TB',
];

describe('a direction statement in a screen name', () => {
  it.each(names)('RF-508 the screen %j keeps its node, label and links', async (name) => {
    const text = screenMapDiagram([
      screenCard('SCRN-001', name, ['SCRN-002']),
      screenCard('SCRN-002', '/b', ['SCRN-001']),
    ]);
    const parsed = await parseDiagram(text);

    expect(parsed.nodes).toEqual([
      { id: 's1', label: name },
      { id: 's2', label: '/b' },
    ]);
    expect(parsed.edges.map((edge) => [edge.from, edge.to])).toEqual([
      ['s1', 's2'],
      ['s2', 's1'],
    ]);
  });
});

describe('a direction statement in a data model name', () => {
  const one: Cardinality = 'one';

  it.each(names)('RF-508 the entity, field and relation %j stay in the diagram', async (name) => {
    const text = entityDiagram({
      entities: [
        { cardId: 'ENT-001', name, fields: [{ name }] },
        { cardId: 'ENT-002', name: 'B', fields: [] },
      ],
      relations: [
        { from: 'ENT-001', to: 'ENT-002', label: name, fromCardinality: one, toCardinality: one },
      ],
    });
    const parsed = await parseDiagram(text);

    expect(parsed.nodes).toEqual([
      { id: 'e1', label: name },
      { id: 'e2', label: 'B' },
      { id: 'e1.field.f1', label: `|${name}` },
    ]);
    expect(parsed.edges.map((edge) => [edge.from, edge.to, edge.label])).toEqual([
      ['e1', 'e2', name],
    ]);
  });
});
