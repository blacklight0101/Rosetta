import { expect, it } from 'vitest';
import { parseDirStream } from '../../../../../src/infrastructure/sources/workbook/ovba-dir.js';
import { buildDirStream, record, u16, u32 } from '../../../../support/ovba-dir.js';

// RF-154, MS-OVBA 2.3.4: the `dir` stream names the modules, their streams and where the compressed
// source starts. Every size in it is chosen by the file's author.

const MAX = 1000;

function infoOf(dir: Buffer): ReturnType<typeof parseDirStream> & { ok: true } {
  const result = parseDirStream(dir, MAX);
  if (!result.ok) throw new Error(`${result.error.reason}: ${result.error.detail}`);
  return result;
}

function reasonOf(dir: Buffer, max = MAX): string {
  const result = parseDirStream(dir, max);
  return result.ok ? 'ok' : result.error.reason;
}

function detailOf(dir: Buffer): string {
  const result = parseDirStream(dir, MAX);
  return result.ok ? 'ok' : result.error.detail;
}

const TWO = [
  { name: 'Module1', offset: 40, standard: true },
  { name: 'Sheet1', streamName: 'Sheet1', offset: 52, standard: false },
];

it('RF-154 reads the project name, code page, module names, stream names, offsets and kinds', () => {
  const info = infoOf(buildDirStream({ modules: TWO, projectName: 'Pricing' })).value;

  expect(info.projectName).toBe('Pricing');
  expect(info.codePage).toBe(1252);
  expect(info.modules).toEqual([
    { name: 'Module1', streamName: 'Module1', offset: 40, standard: true },
    { name: 'Sheet1', streamName: 'Sheet1', offset: 52, standard: false },
  ]);
});

it('RF-154 skips a record with an unknown id by its size and keeps reading', () => {
  const info = infoOf(buildDirStream({ modules: TWO, unknownRecordId: 0x7777 })).value;

  expect(info.modules.map((module) => module.name)).toEqual(['Module1', 'Sheet1']);
});

it('RF-154 decodes names with the project code page, not only 1252', () => {
  const nameBytes = Buffer.from([0x93, 0xfa, 0x96, 0x7b]);
  const module = { name: 'M', offset: 0, standard: true, nameBytes };
  const info = infoOf(buildDirStream({ codePage: 932, modules: [module] })).value;

  expect(info.codePage).toBe(932);
  expect(info.encoding).toBe('shift_jis');
  expect(info.modules[0]?.name).toBe('日本');
});

it('RF-154 falls back to windows-1252 for a code page it cannot decode', () => {
  const info = infoOf(buildDirStream({ codePage: 437, modules: TWO })).value;

  expect(info.codePage).toBe(437);
  expect(info.encoding).toBe('windows-1252');
});

it('RF-154 refuses a module count above the limit before reading any module', () => {
  const dir = buildDirStream({ modules: [], declaredCount: 10_000 });

  expect(reasonOf(dir)).toBe('too-many');
});

it('RF-154 refuses more module records than the limit whatever the declared count says', () => {
  const modules = Array.from({ length: 6 }, (_, i) => ({
    name: `M${String(i)}`,
    offset: 0,
    standard: true,
  }));

  expect(reasonOf(buildDirStream({ modules, declaredCount: 1 }), 5)).toBe('too-many');
  expect(reasonOf(buildDirStream({ modules }), 6)).toBe('ok');
});

it('RF-154 refuses a record whose size runs past the end of the stream', () => {
  const hostile = Buffer.concat([
    record(0x0003, u16(1252)),
    u16(0x0019),
    u32(0xffffffff),
    Buffer.alloc(8),
  ]);

  expect(reasonOf(hostile)).toBe('corrupt');
  expect(detailOf(hostile)).toContain('past the end');
});

it('RF-154 refuses a stream cut in the middle of a record or without its terminator', () => {
  const whole = buildDirStream({ modules: TWO });

  expect(reasonOf(whole.subarray(0, whole.length - 3))).toBe('corrupt');
  expect(reasonOf(whole.subarray(0, whole.length - 6))).toBe('corrupt');
  expect(reasonOf(Buffer.alloc(0))).toBe('corrupt');
});

it('RF-154 gives a module without an offset record no offset', () => {
  const dir = Buffer.concat([
    record(0x0003, u16(1252)),
    record(0x000f, u16(1)),
    record(0x0019, Buffer.from('Lonely')),
    record(0x001a, Buffer.from('Lonely')),
    record(0x0021),
    record(0x002b),
    record(0x0010),
  ]);

  expect(infoOf(dir).value.modules).toEqual([
    { name: 'Lonely', streamName: 'Lonely', standard: true },
  ]);
});
