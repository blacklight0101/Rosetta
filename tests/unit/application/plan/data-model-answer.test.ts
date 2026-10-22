import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { cardLimits } from '../../../../src/application/cards/card-limits.js';
import { parseDataModelAnswer } from '../../../../src/application/plan/data-model-answer.js';

// RF-623, ADR-013: the planner's data model is untrusted text read as one bounded JSON object.
// What the tables may hold is decided by the domain (data-model-assembly.ts), not here. A part that
// fails its schema is dropped alone and named in the problems; the rest of the answer is kept (EV-02).

const column = { name: 'id', type: 'uuid' };
const table = { name: 'customer', purpose: 'Keeps people.', columns: [column] };
const fixturePath = new URL(
  '../../../fixtures/planner/data-model-long-field.json',
  import.meta.url,
);

describe('parseDataModelAnswer', () => {
  it('RF-623 reads a fenced answer and gives every part it left out its empty value', () => {
    const parsed = parseDataModelAnswer(
      `The model.\n\`\`\`json\n${JSON.stringify({ tables: [table] })}\n\`\`\``,
    );

    expect(parsed?.draft).toEqual({
      tables: [
        {
          ...{ name: 'customer', purpose: 'Keeps people.', sources: [] },
          columns: [{ name: 'id', type: 'uuid', nullable: true, legacy: null, risk: '' }],
          ...{ primaryKey: [], uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
        },
      ],
      dropped: [],
    });
    expect(parsed?.problems).toEqual([]);
  });

  it('RF-623 reads the legacy source, the dropped fields, the keys and the indexes', () => {
    const answer = {
      tables: [
        {
          ...table,
          columns: [{ ...column, nullable: false, legacy: { claim: 'ENT-001.c1', field: 'Id' } }],
          primaryKey: ['id'],
          uniqueKeys: [['id']],
          foreignKeys: [{ columns: ['id'], references: 'other', referencedColumns: ['id'] }],
          indexes: [{ columns: ['id'], unique: true, reason: 'Lookups.' }],
          checks: ['id is set'],
          sources: ['ENT-001'],
        },
      ],
      dropped: [{ claim: 'ENT-001.c2', field: 'Fax', reason: 'Not needed.' }],
    };

    const draft = parseDataModelAnswer(JSON.stringify(answer))?.draft;

    expect(draft?.tables[0]).toMatchObject({
      columns: [{ legacy: { claim: 'ENT-001.c1', field: 'Id' }, nullable: false }],
      primaryKey: ['id'],
      uniqueKeys: [['id']],
      indexes: [{ columns: ['id'], unique: true, reason: 'Lookups.' }],
      checks: ['id is set'],
    });
    expect(draft?.dropped).toEqual(answer.dropped);
  });
});

describe('parseDataModelAnswer: an over-long legacy field (EV-02)', () => {
  it('RF-623 drops only that column: every table is kept and the drop is named', async () => {
    const parsed = parseDataModelAnswer(await readFile(fixturePath, 'utf8'));

    expect(parsed?.draft.tables.map((entry) => entry.name)).toEqual(['record', 'entry', 'item']);
    // The fixture's entry table has four columns; the over-long one is dropped, three are kept.
    expect(parsed?.draft.tables[1]?.columns).toHaveLength(3);
    expect(parsed?.problems).toHaveLength(1);
    expect(parsed?.problems[0]).toMatchObject({
      item: 'range_note',
      field: 'table entry columns 3',
    });
    expect(parsed?.problems[0]?.reason).toContain('fails its schema');
  });
});

describe('parseDataModelAnswer: a part that fails its schema', () => {
  it('RF-623 a table with no valid column is dropped and named, the other tables are kept', () => {
    const broken = { ...table, name: 'empty', columns: [{ name: 'x'.repeat(81), type: 'uuid' }] };

    const parsed = parseDataModelAnswer(JSON.stringify({ tables: [table, broken] }));

    expect(parsed?.draft.tables.map((entry) => entry.name)).toEqual(['customer']);
    expect(JSON.stringify(parsed?.problems)).toContain('empty');
  });

  it('RF-623 an oversized purpose drops that table and names it, the others are kept', () => {
    const long = { ...table, name: 'long', purpose: 'x'.repeat(2001) };

    const parsed = parseDataModelAnswer(JSON.stringify({ tables: [long, table] }));

    expect(parsed?.draft.tables.map((entry) => entry.name)).toEqual(['customer']);
    expect(JSON.stringify(parsed?.problems)).toContain('long');
  });

  it('RF-623 items past a count limit are dropped and named; the limit still holds', () => {
    const many = { ...table, columns: Array.from({ length: 201 }, () => column) };

    const parsed = parseDataModelAnswer(JSON.stringify({ tables: [many] }));

    expect(parsed?.draft.tables[0]?.columns).toHaveLength(200);
    expect(parsed?.problems).toHaveLength(1);
    expect(parsed?.problems[0]?.reason).toContain('count limit');
  });

  it('RF-623 an answer with tables and none usable is kept as unusable and says why', () => {
    const empty = { ...table, columns: [] };

    const parsed = parseDataModelAnswer(JSON.stringify({ tables: [empty] }));

    expect(parsed?.draft.tables).toEqual([]);
    expect(parsed?.problems).toHaveLength(1);
  });
});

describe('parseDataModelAnswer: answers that are no answer', () => {
  it('RF-623 an answer without a table is no answer', () => {
    expect(parseDataModelAnswer('{"tables": []}')).toBeUndefined();
    expect(parseDataModelAnswer('No tables today.')).toBeUndefined();
  });

  it('RF-623 reads only the head of an answer longer than the card limit', () => {
    const padded = `${' '.repeat(cardLimits.maxOutputChars)}${JSON.stringify({ tables: [table] })}`;

    expect(parseDataModelAnswer(padded)).toBeUndefined();
  });
});
