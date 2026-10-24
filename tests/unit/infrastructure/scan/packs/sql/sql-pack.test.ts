import { describe, expect, it } from 'vitest';
import type { PackSymbol } from '../../../../../../src/application/ports/language-pack.js';
import { SqlPack } from '../../../../../../src/infrastructure/scan/packs/sql/sql-pack.js';
import { LanguagePackRegistry } from '../../../../../../src/infrastructure/scan/packs/pack-registry.js';
import { analyseWithPacks } from '../../../../../../src/infrastructure/scan/packs/pack-scan.js';
import { entry } from '../../../../../support/code-map-builders.js';
import { bytesReader } from '../../../../../support/bytes-reader.js';
import { MemoryLogger } from '../../../../../support/memory-logger.js';
import { languagePackContract } from '../../../../../contracts/language-pack.contract.js';

// P5-36, RF-104, RF-110, DEC-11, ADR-004, ADR-013: the SQL pack lists the tables, views, procedures,
// triggers and functions a `.sql` script creates, with their line ranges. Synthetic script: invented
// names only, shaped like the schema scripts of the 2026-10-24 recall benchmark.

const clinic = [
  "-- Clinic demo schema (synthetic). A comment that names 'create procedure Ghost'.", // 1
  'create database ClinicDemo', // 2
  'GO', // 3
  'create table [dbo].[Visit]', // 4
  '(', // 5
  '    VisitId int primary key,', // 6
  "    Paid varchar(10), -- 'paid' or 'Paid' ) in a comment", // 7
  '    NotifyPatient bit,', // 8
  '    NotifyDoctor bit', // 9
  ')', // 10
  'GO', // 11
  '/* a block comment', // 12
  '   create procedure Ghost2 */', // 13
  'create view TopVisits', // 14
  'as', // 15
  'select top 20 VisitId from Visit order by VisitId desc', // 16
  'GO', // 17
  'CREATE PROC CloseVisit @VisitId int', // 18
  'as', // 19
  'begin', // 20
  "    update Visit set Paid = 'paid', NotifyPatient = 1, NotifyDoctor = 1 where VisitId = @VisitId", // 21
  '    create table #scratch (x int)', // 22
  'end', // 23
  '', // 24
  'create trigger VisitAudit on Visit after update', // 25
  'as', // 26
  'begin', // 27
  '    set nocount on', // 28
  'end', // 29
  'GO', // 30
  'CREATE OR ALTER FUNCTION dbo.fnShort(@s varchar(50)) returns varchar(2)', // 31
  'as', // 32
  'begin', // 33
  '    return cast(@s as varchar(2))', // 34
  'end', // 35
  '',
].join('\n');

const pack = new SqlPack();

function shape(symbols: readonly PackSymbol[]): string[] {
  return symbols.map((s) => `${s.kind}:${s.name}:${String(s.startLine)}-${String(s.endLine)}`);
}

languagePackContract('SqlPack', () => Promise.resolve(new SqlPack()), {
  path: 'db/clinic.sql',
  text: clinic,
});

describe('SQL pack', () => {
  it('P5-36 claims .sql and names itself', () => {
    expect([pack.name, pack.extensions]).toEqual(['sql', ['.sql']]);
  });

  it('P5-36 lists each table, view, procedure, trigger and function with its line range', () => {
    const { symbols } = pack.analyse({ path: 'db/clinic.sql', text: clinic });

    expect(shape(symbols)).toEqual([
      'table:Visit:4-10',
      'view:TopVisits:14-16',
      'procedure:CloseVisit:18-23',
      'trigger:VisitAudit:25-29',
      'stored-function:fnShort:31-35',
    ]);
  });

  it('P5-36 skips comments, strings, temporary tables and the database itself', () => {
    const names = pack.analyse({ path: 'a.sql', text: clinic }).symbols.map((s) => s.name);

    expect(names).not.toContain('Ghost');
    expect(names).not.toContain('Ghost2');
    expect(names).not.toContain('#scratch');
    expect(names).not.toContain('ClinicDemo');
  });
});

describe('SQL pack dialects', () => {
  it('P5-36 reads other dialects: quoted names, IF NOT EXISTS, ALTER, OR REPLACE and a body without GO', () => {
    const text = [
      'CREATE TABLE IF NOT EXISTS `shop`.`Order Line` (id int);', // 1
      'CREATE TEMPORARY TABLE tmp_sales (id int);', // 2
      'alter procedure "Reports"."Daily" as select 1', // 3
      'create or replace view v_open as select * from t', // 4
      'create function f() returns int as $$ begin return 1; end $$ language plpgsql;', // 5
      '',
    ].join('\n');

    const { symbols } = pack.analyse({ path: 'x.sql', text });

    expect(shape(symbols)).toEqual([
      'table:Order Line:1-1',
      'procedure:Daily:3-3',
      'view:v_open:4-4',
      'stored-function:f:5-5',
    ]);
  });

  it('P5-36 keeps a table whole when its definition has a nested parenthesis and no GO', () => {
    const text = [
      'create table T (',
      '  a decimal(10, 2),',
      '  b int',
      ')',
      'create table U (x int)',
    ].join('\n');

    expect(shape(pack.analyse({ path: 't.sql', text }).symbols)).toEqual([
      'table:T:1-4',
      'table:U:5-5',
    ]);
  });

  it('P5-36 answers a script with a byte order mark and CRLF line ends like one without', () => {
    const bom = String.fromCharCode(0xfeff);
    const crlf = `${bom}${clinic.replaceAll('\n', '\r\n')}`;

    expect(pack.analyse({ path: 'a.sql', text: crlf }).symbols).toEqual(
      pack.analyse({ path: 'a.sql', text: clinic }).symbols,
    );
  });
});

describe('SQL pack on hostile scripts', () => {
  it('ADR-013 reads a hostile script in linear time and keeps the number of objects bounded', () => {
    const started = Date.now();
    const deepParens = `create table Deep (${'('.repeat(1_000_000)}\n`;
    const longLine = `create view ${'a'.repeat(1_500_000)} as select 1\n`;
    const many = Array.from({ length: 5000 }, (_, i) => `create view v${String(i)} as select 1`);

    const first = pack.analyse({ path: 'h1.sql', text: deepParens });
    const second = pack.analyse({ path: 'h2.sql', text: longLine });
    const third = pack.analyse({ path: 'h3.sql', text: many.join('\n') });

    expect(first.symbols.length).toBeLessThanOrEqual(1);
    expect(second.symbols.every((s) => s.name.length <= 200)).toBe(true);
    expect(third.symbols.length).toBe(1000);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('ADR-013 refuses a script over the size bound so the scan keeps the file coarse', () => {
    const text = `${'-- x\n'.repeat(500_000)}create table T (a int)\n`;

    expect(() => pack.analyse({ path: 'big.sql', text })).toThrow(/too large/u);
  });
});

describe('SQL pack in the scan', () => {
  it('P5-36 maps a .sql file at level symbols and records its objects', async () => {
    const scan = await analyseWithPacks({
      files: [entry('db/clinic.sql', 300)].map((file) => ({ ...file, language: 'sql' })),
      reader: bytesReader({ 'db/clinic.sql': clinic }),
      registry: new LanguagePackRegistry([pack]),
      logger: new MemoryLogger(),
      maxFileBytes: 1_000_000,
    });

    expect(scan.fileLevels).toEqual([{ path: 'db/clinic.sql', mapLevel: 'symbols' }]);
    expect(scan.symbols.map((s) => s.kind)).toEqual([
      'table',
      'view',
      'procedure',
      'trigger',
      'stored-function',
    ]);
    expect(scan.languagePacks).toEqual([{ name: 'sql', version: pack.version }]);
  });
});
