import { describe, expect, it } from 'vitest';
import { cardLimits } from '../../../../src/application/cards/card-limits.js';
import { parseDataModelAnswer } from '../../../../src/application/plan/data-model-answer.js';

// RF-623, ADR-013: the planner's data model is untrusted text read as one bounded JSON object.
// What the tables may hold is decided by the domain (data-model-assembly.ts), not here.

const column = { name: 'id', type: 'uuid' };
const table = { name: 'customer', purpose: 'Keeps people.', columns: [column] };

describe('parseDataModelAnswer', () => {
  it('RF-623 reads a fenced answer and gives every part it left out its empty value', () => {
    const draft = parseDataModelAnswer(
      `The model.\n\`\`\`json\n${JSON.stringify({ tables: [table] })}\n\`\`\``,
    );

    expect(draft).toEqual({
      tables: [
        {
          ...{ name: 'customer', purpose: 'Keeps people.', sources: [] },
          columns: [{ name: 'id', type: 'uuid', nullable: true, legacy: null, risk: '' }],
          ...{ primaryKey: [], uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
        },
      ],
      dropped: [],
    });
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

    const draft = parseDataModelAnswer(JSON.stringify(answer));

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

describe('parseDataModelAnswer: answers that are no answer', () => {
  it('RF-623 an answer without a table is no answer', () => {
    expect(parseDataModelAnswer('{"tables": []}')).toBeUndefined();
    expect(parseDataModelAnswer('No tables today.')).toBeUndefined();
  });

  it('RF-623 a table without a column makes the answer unusable', () => {
    const empty = { ...table, columns: [] };

    expect(parseDataModelAnswer(JSON.stringify({ tables: [empty] }))).toBeUndefined();
  });

  it('RF-623 an oversized text or list makes the answer unusable', () => {
    const long = { ...table, purpose: 'x'.repeat(2001) };
    const many = { ...table, columns: Array.from({ length: 201 }, () => column) };

    expect(parseDataModelAnswer(JSON.stringify({ tables: [long] }))).toBeUndefined();
    expect(parseDataModelAnswer(JSON.stringify({ tables: [many] }))).toBeUndefined();
  });

  it('RF-623 reads only the head of an answer longer than the card limit', () => {
    const padded = `${' '.repeat(cardLimits.maxOutputChars)}${JSON.stringify({ tables: [table] })}`;

    expect(parseDataModelAnswer(padded)).toBeUndefined();
  });
});
