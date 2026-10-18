import { describe, expect, it } from 'vitest';
import {
  isIdentifier,
  typeOrUnconfirmed,
  unconfirmedType,
} from '../../../../src/domain/planning/data-model-names.js';

// RF-623, RF-603: a table or column name is an identifier and a type is a type name, so the data
// model can hold no executable DDL.

describe('isIdentifier', () => {
  it.each(['id', 'customer_order', '_x1', 'A'])('RF-623 accepts %s', (name) => {
    expect(isIdentifier(name)).toBe(true);
  });

  it.each(['', '1a', 'a b', 'a-b', 'a;drop', 'a"b', 'a.b', 'a'.repeat(64)])(
    'RF-623 refuses %j',
    (name) => {
      expect(isIdentifier(name)).toBe(false);
    },
  );
});

describe('typeOrUnconfirmed', () => {
  it.each([
    'uuid',
    'varchar(200)',
    'numeric(10,2)',
    'timestamp with time zone',
    'integer[]',
    '  double   precision ',
  ])('RF-623 keeps the type name %j', (type) => {
    expect(typeOrUnconfirmed(type)).toBe(type.trim().replace(/ {2,}/gu, ' '));
  });

  it.each([
    'integer); DROP TABLE customer;--',
    'drop table customer',
    'varchar(200) not null default (select 1)',
    'int\nint',
    '',
    'a'.repeat(60),
  ])('RF-603 writes %j as to confirm, never as a statement', (type) => {
    expect(typeOrUnconfirmed(type)).toBe(unconfirmedType);
  });
});
