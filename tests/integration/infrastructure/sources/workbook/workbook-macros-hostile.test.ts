import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import {
  DEFAULT_MACRO_LIMITS,
  type MacroLimits,
} from '../../../../../src/infrastructure/sources/workbook/macro-limits.js';
import { readMacroProject } from '../../../../../src/infrastructure/sources/workbook/macro-reader.js';
import { buildDirStream } from '../../../../support/ovba-dir.js';
import { buildVbaProject, type ProjectSpec } from '../../../../support/vba-project.js';

// RF-154: hostile VBA projects. Every length, count, offset and sector number of the file is chosen
// by whoever made it; each case here would exhaust memory or time without its guard.

const BAS = 'Sub Run()\r\nEnd Sub\r\n';
const NUL = String.fromCharCode(0);
const SECTOR = 512;
const START_AT = 116;

function read(spec: ProjectSpec, limits: MacroLimits = DEFAULT_MACRO_LIMITS) {
  return readMacroProject(buildVbaProject(spec), limits);
}

function codeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof RosettaError ? error.code : String(error);
  }
  return 'no error';
}

function standardModules(names: readonly string[], source = BAS): ProjectSpec['modules'] {
  return names.map((name) => ({ name, kind: 'standard' as const, source }));
}

it('RF-154 refuses a dir stream that lists 10,000 modules', () => {
  const modules = Array.from({ length: 10_000 }, (_, i) => ({
    name: `M${String(i)}`,
    offset: 0,
    standard: true,
  }));
  const dirStream = buildDirStream({ modules });

  expect(codeOf(() => read({ modules: [], dirStream }))).toBe(ERROR_CODES.workbookTooLarge);
});

it('RF-154 refuses a module count above the limit', () => {
  const limits = { ...DEFAULT_MACRO_LIMITS, maxModules: 2 };

  const action = () => read({ modules: standardModules(['A', 'B', 'C']) }, limits);

  expect(codeOf(action)).toBe(ERROR_CODES.workbookTooLarge);
});

it('RF-154 refuses a module that decompresses past the module limit', () => {
  const limits = { ...DEFAULT_MACRO_LIMITS, maxModuleBytes: 5_000 };

  const action = () => read({ modules: standardModules(['M'], 'x'.repeat(10_000)) }, limits);

  expect(codeOf(action)).toBe(ERROR_CODES.workbookTooLarge);
});

it('RF-154 refuses a project whose sources together pass the project limit', () => {
  const limits = { ...DEFAULT_MACRO_LIMITS, maxSourceBytes: 10_000 };

  const action = () =>
    read({ modules: standardModules(['A', 'B', 'C'], 'y'.repeat(4_000)) }, limits);

  expect(codeOf(action)).toBe(ERROR_CODES.workbookTooLarge);
});

it('RF-154 refuses a dir stream that expands without bound from a tiny input', () => {
  const chunk = Buffer.from([0x03, 0xb0, 0x02, 0x61, 0xfc, 0x0f]);
  const bomb = Buffer.concat([Buffer.from([1]), ...Array.from({ length: 3000 }, () => chunk)]);
  const limits = { ...DEFAULT_MACRO_LIMITS, maxDirBytes: 100_000 };

  expect(bomb.length).toBeLessThan(20_000);
  expect(codeOf(() => read({ modules: [], rawDir: bomb }, limits))).toBe(
    ERROR_CODES.workbookTooLarge,
  );
});

it('RF-154 refuses more form controls than the limit', () => {
  const controls = [
    { name: 'Button1', type: 'Forms.CommandButton.1' },
    { name: 'Button2', type: 'Forms.CommandButton.1' },
  ];
  const limits = { ...DEFAULT_MACRO_LIMITS, maxControls: 1 };

  const action = () =>
    read({ modules: [{ name: 'F', kind: 'form', source: BAS, controls }] }, limits);

  expect(codeOf(action)).toBe(ERROR_CODES.workbookTooLarge);
});

it('RF-154 refuses a form definition larger than the text stream limit', () => {
  const controls = Array.from({ length: 50 }, (_, i) => ({
    name: `Button${String(i)}`,
    type: 'Forms.CommandButton.1',
  }));
  const limits = { ...DEFAULT_MACRO_LIMITS, maxTextStreamBytes: 500 };

  const action = () =>
    read({ modules: [{ name: 'F', kind: 'form', source: BAS, controls }] }, limits);

  expect(codeOf(action)).toBe(ERROR_CODES.workbookTooLarge);
});

it('RF-154 reports a file that is not a compound file as an unreadable project', () => {
  const project = readMacroProject(Buffer.from('not read here'), DEFAULT_MACRO_LIMITS);

  expect(project.state).toBe('unreadable');
  expect(project.modules).toEqual([]);
});

it('RF-154 reports a project without a dir stream, or with a damaged one, as unreadable', () => {
  const noDir = read({ modules: standardModules(['M']), omitDir: true });
  const damaged = read({ modules: [], rawDir: Buffer.from([1, 2, 3]) });

  expect(noDir.state).toBe('unreadable');
  expect(damaged.state).toBe('unreadable');
});

it('RF-154 reports a compound file whose sector chain loops as unreadable and stops', () => {
  const bytes = buildVbaProject({ modules: standardModules(['Big'], noise(6000)) });
  const looping = makeStreamLoop(bytes, 'Big');

  expect(readMacroProject(looping, DEFAULT_MACRO_LIMITS).state).toBe('unreadable');
});

it('RF-154 reports a compound file with absurd header counts as unreadable', () => {
  const bytes = buildVbaProject({ modules: standardModules(['M']) });
  const difat = Buffer.from(bytes);
  difat.writeUInt32LE(0x7fffffff, 0x48);
  const directory = Buffer.from(bytes);
  directory.writeInt32LE(0x7ffffff0, 0x30);

  expect(readMacroProject(difat, DEFAULT_MACRO_LIMITS).state).toBe('unreadable');
  expect(readMacroProject(directory, DEFAULT_MACRO_LIMITS).state).toBe('unreadable');
});

/** Deterministic text that does not compress, so a module stream is stored in the FAT. */
function noise(length: number): string {
  let state = 12345;
  return Array.from({ length }, () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return String.fromCharCode(33 + (state % 90));
  }).join('');
}

/**
 * Makes the chain of stream `name` loop and points its directory entry at the second sector, so the
 * loop is entered from the side: `cfb` follows such a chain without end unless the table is checked.
 */
function makeStreamLoop(bytes: Buffer, name: string): Buffer {
  const out = Buffer.from(bytes);
  const fatAt = (out.readInt32LE(0x4c) + 1) * SECTOR;
  const entryAt = out.indexOf(Buffer.from(`${name}${NUL}`, 'utf16le'));
  const first = out.readInt32LE(entryAt + START_AT);
  const chain = [first];
  let next = out.readInt32LE(fatAt + first * 4);
  while (next >= 0) {
    chain.push(next);
    next = out.readInt32LE(fatAt + next * 4);
  }
  const second = chain[1] ?? first;
  out.writeInt32LE(second, entryAt + START_AT);
  out.writeInt32LE(second, fatAt + (chain[chain.length - 1] ?? first) * 4);
  return out;
}
