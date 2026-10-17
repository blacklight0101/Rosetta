// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { entityDiagram } from '../../../../src/domain/diagrams/entity-diagram.js';
import { flowSequenceDiagram } from '../../../../src/domain/diagrams/flow-sequence.js';
import { screenMapDiagram } from '../../../../src/domain/diagrams/screen-map.js';
import { cardOf, flowCard, screenCard } from '../../../support/diagram-fixtures.js';
import {
  entityCase,
  expectedEntities,
  expectedRelations,
  expectedScreens,
  expectedSequence,
  screenCase,
  sequenceCase,
} from '../../../support/diagram-cases.js';
import { seededNames } from '../../../support/hostile-names.js';
import { parseDiagram } from '../../../support/mermaid-parse.js';

// RF-508 (P2-21 Done when): names holding `end`, `;`, newlines, `-->`, `%%`, `click`, `<script>`,
// `"` and `javascript:` give diagrams the pinned Mermaid parser reads as exactly the nodes and
// edges the generator meant, with every label shown as written; and no label adds a statement:
// every line of the text has one of the shapes the generator writes.

const runs = 60;
const label = '(?:[A-Za-z0-9 .,]|#\\d+;)+';
const asciiOnly = /^[\x20-\x7E\n]*$/;

function statementsMatch(text: string, shapes: readonly RegExp[]): boolean {
  const lines = text.trimEnd().split('\n');
  return lines.every((line) => shapes.some((shape) => shape.test(line)));
}

const sequenceShapes = [
  /^sequenceDiagram$/,
  new RegExp(`^ {2}participant p\\d+ as ${label}$`),
  new RegExp(`^ {2}p\\d+->>p\\d+: ${label}$`),
  new RegExp(`^ {2}Note (?:right of|over) p\\d+: ${label}$`),
];

const screenShapes = [
  /^flowchart LR$/,
  new RegExp(`^ {2}s\\d+\\["${label}"\\]$`),
  /^ {2}s\d+ --> s\d+$/,
];

const ends = ['\\|\\|', '\\|o', '\\}o', '\\}\\|', 'o\\|', 'o\\{', '\\|\\{'].join('|');
const entityShapes = [
  /^erDiagram$/,
  new RegExp(`^ {2}e\\d+\\["${label}"\\](?: \\{)?$`),
  new RegExp(`^ {4}field f\\d+(?: (?:PK|FK|UK)(?:, (?:PK|FK|UK))*)? "${label}"$`),
  /^ {2}\}$/,
  new RegExp(`^ {2}e\\d+ (?:${ends})(?:--|\\.\\.)(?:${ends}) e\\d+ : "${label}"$`),
];

describe('flow sequence diagrams over hostile names', () => {
  it('RF-508 parse to the participants and messages meant, labels shown as written', async () => {
    const name = seededNames(260);
    for (let run = 0; run < runs; run += 1) {
      const names = sequenceCase(name);
      const flow = flowCard(names.trigger, names.outcome, [
        { text: names.first, target: 'BR-001' },
        { text: names.second },
        { text: names.third, target: names.target, branches: [names.branch] },
      ]);
      const card = cardOf({ id: 'BR-001', type: 'BR', title: names.title });
      const text = flowSequenceDiagram(flow, [card]);

      expect(text).toMatch(asciiOnly);
      expect(statementsMatch(text, sequenceShapes)).toBe(true);
      expect(await parseDiagram(text)).toEqual(expectedSequence(names));
    }
  });
});

describe('screen maps over hostile names', () => {
  it('RF-508 parse to the screens and links meant, labels shown as written', async () => {
    const name = seededNames(261);
    for (let run = 0; run < runs; run += 1) {
      const names = screenCase(name);
      const text = screenMapDiagram([
        screenCard('SCRN-001', names.first, ['SCRN-002', names.missing]),
        screenCard('SCRN-002', names.second, [names.first]),
      ]);

      expect(text).toMatch(asciiOnly);
      expect(statementsMatch(text, screenShapes)).toBe(true);
      expect(await parseDiagram(text)).toEqual(expectedScreens(names));
    }
  });
});

describe('entity-relationship diagrams over hostile names', () => {
  it('RF-508 parse to the entities, fields and relations meant, labels as written', async () => {
    const name = seededNames(262);
    for (let run = 0; run < runs; run += 1) {
      const names = entityCase(name, run);
      const text = entityDiagram(names.model);

      expect(text).toMatch(asciiOnly);
      expect(statementsMatch(text, entityShapes)).toBe(true);
      const parsed = await parseDiagram(text);
      expect(parsed.nodes).toEqual(expectedEntities(names));
      expect(parsed.edges).toEqual(expectedRelations(names));
    }
  });
});
