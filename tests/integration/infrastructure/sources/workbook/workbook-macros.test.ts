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

// RF-154: a VBA project is built in each test with `cfb` and a test-side compressor, read as text
// and never run. The hostile cases check that every length, count and offset of the file is bounded.

const BAS = 'Attribute VB_Name = "Module1"\r\nSub Run()\r\n  Shell "calc.exe"\r\nEnd Sub\r\n';

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

it('RF-154 returns a standard module as .bas text and the other kinds as .cls', () => {
  const project = read({
    modules: [
      { name: 'Module1', kind: 'standard', source: BAS },
      { name: 'Class1', kind: 'class', source: 'Option Explicit\r\n' },
      { name: 'Sheet1', kind: 'document', source: "' sheet\r\n" },
      { name: 'ThisWorkbook', kind: 'document', source: "' book\r\n" },
      { name: 'UserForm1', kind: 'form', source: "' form\r\n" },
    ],
  });

  expect(project.state).toBe('readable');
  expect(project.modules.map((m) => [m.name, m.kind, m.extension])).toEqual([
    ['Module1', 'standard', 'bas'],
    ['Class1', 'class', 'cls'],
    ['Sheet1', 'document', 'cls'],
    ['ThisWorkbook', 'document', 'cls'],
    ['UserForm1', 'form', 'cls'],
  ]);
  expect(project.modules[0]?.source).toEqual({ status: 'text', text: BAS });
});

it('RF-154 decodes the source with the code page of the project', () => {
  const japanese = Buffer.from([0x27, 0x93, 0xfa, 0x96, 0x7b, 0x0d, 0x0a]);
  const project = read({
    codePage: 932,
    modules: [{ name: 'Module1', kind: 'standard', source: japanese }],
  });

  expect(project.codePage).toBe(932);
  expect(project.modules[0]?.source).toEqual({ status: 'text', text: "'日本\r\n" });
});

it('RF-154 decodes Cyrillic with code page 1251', () => {
  const project = read({
    codePage: 1251,
    modules: [{ name: 'Module1', kind: 'standard', source: Buffer.from([0xcf, 0xf0, 0xe8]) }],
  });

  expect(project.modules[0]?.source).toEqual({ status: 'text', text: 'При' });
});

it('RF-154 lists the controls of a user form', () => {
  const project = read({
    modules: [
      {
        name: 'UserForm1',
        kind: 'form',
        source: "' form\r\n",
        controls: [
          { name: 'CommandButton1', type: 'Forms.CommandButton.1' },
          { name: 'TextBox1', type: 'Forms.TextBox.1' },
        ],
      },
    ],
  });

  expect(project.formControls).toEqual([
    { form: 'UserForm1', name: 'CommandButton1', type: 'Forms.CommandButton.1' },
    { form: 'UserForm1', name: 'TextBox1', type: 'Forms.TextBox.1' },
  ]);
});

it('RF-154 skips a project locked for viewing and names its modules (Q-40)', () => {
  const project = read({
    locked: true,
    modules: [{ name: 'Module1', kind: 'standard', source: BAS }],
  });

  expect(project.state).toBe('locked');
  expect(project.modules).toEqual([
    { name: 'Module1', kind: 'standard', extension: 'bas', source: { status: 'locked' } },
  ]);
  expect(JSON.stringify(project)).not.toContain('Shell');
});

it('RF-154 names a module that has only compiled code', () => {
  const project = read({
    modules: [
      { name: 'Compiled', kind: 'standard', compiledOnly: true },
      { name: 'Module1', kind: 'standard', source: BAS },
    ],
  });

  expect(project.modules[0]?.source).toEqual({ status: 'no-source' });
  expect(project.modules[1]?.source.status).toBe('text');
});

it('RF-154 skips a module whose offset is past the end of its stream and reads the others', () => {
  const project = read({
    modules: [
      { name: 'Bad', kind: 'standard', source: BAS, offset: 5_000_000 },
      { name: 'Good', kind: 'standard', source: BAS },
    ],
  });

  expect(project.modules[0]?.source.status).toBe('unreadable');
  expect(project.modules[1]?.source).toEqual({ status: 'text', text: BAS });
});

it('RF-154 skips a module whose stream is missing or whose compressed source is damaged', () => {
  const damaged = Buffer.concat([Buffer.alloc(40, 0x41), Buffer.from([1, 0x00, 0xb0, 0xff])]);
  const project = read({
    modules: [
      { name: 'Missing', kind: 'standard', source: BAS, omitStream: true },
      { name: 'Damaged', kind: 'standard', rawStream: damaged },
      { name: 'Good', kind: 'standard', source: BAS },
    ],
  });

  expect(project.modules.map((m) => m.source.status)).toEqual(['unreadable', 'unreadable', 'text']);
});

it('RF-154 reads every module when the dir stream holds a record with an unknown id', () => {
  const project = read({
    unknownRecordId: 0x6666,
    modules: [{ name: 'Module1', kind: 'standard', source: BAS }],
  });

  expect(project.modules[0]?.source).toEqual({ status: 'text', text: BAS });
});

it('RF-154 returns a module that calls Shell as plain text and runs nothing', () => {
  const project = read({ modules: [{ name: 'Module1', kind: 'standard', source: BAS }] });
  const source = project.modules[0]?.source;

  expect(source?.status === 'text' ? source.text.includes('Shell "calc.exe"') : false).toBe(true);
});

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
  const modules = Array.from({ length: 3 }, (_, i) => ({
    name: `M${String(i)}`,
    kind: 'standard' as const,
    source: BAS,
  }));
  const limits = { ...DEFAULT_MACRO_LIMITS, maxModules: 2 };

  expect(codeOf(() => read({ modules }, limits))).toBe(ERROR_CODES.workbookTooLarge);
});

it('RF-154 refuses a module that decompresses past the module limit', () => {
  const big = 'x'.repeat(10_000);
  const limits = { ...DEFAULT_MACRO_LIMITS, maxModuleBytes: 5_000 };

  const action = () => read({ modules: [{ name: 'M', kind: 'standard', source: big }] }, limits);

  expect(codeOf(action)).toBe(ERROR_CODES.workbookTooLarge);
});

it('RF-154 refuses a project whose sources together pass the project limit', () => {
  const modules = ['A', 'B', 'C'].map((name) => ({
    name,
    kind: 'standard' as const,
    source: 'y'.repeat(4_000),
  }));
  const limits = { ...DEFAULT_MACRO_LIMITS, maxSourceBytes: 10_000 };

  expect(codeOf(() => read({ modules }, limits))).toBe(ERROR_CODES.workbookTooLarge);
});

it('RF-154 refuses a project file larger than the limit', () => {
  const limits = { ...DEFAULT_MACRO_LIMITS, maxProjectBytes: 1_000 };

  const action = () => read({ modules: [{ name: 'M', kind: 'standard', source: BAS }] }, limits);

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

it('RF-154 reports a file that is not a compound file as an unreadable project', () => {
  const project = readMacroProject(Buffer.from('not read here'), DEFAULT_MACRO_LIMITS);

  expect(project.state).toBe('unreadable');
  expect(project.modules).toEqual([]);
});

it('RF-154 reports a project without a dir stream, or with a damaged one, as unreadable', () => {
  const noDir = read({ modules: [{ name: 'M', kind: 'standard', source: BAS }], omitDir: true });
  const damaged = read({ modules: [], rawDir: Buffer.from([1, 2, 3]) });

  expect(noDir.state).toBe('unreadable');
  expect(damaged.state).toBe('unreadable');
});

it('RF-154 reports a compound file whose sector chain loops as unreadable and stops', () => {
  const bytes = buildVbaProject({
    modules: [{ name: 'Big', kind: 'standard', source: noise(6000) }],
  });
  const looping = makeChainLoop(bytes);

  expect(readMacroProject(looping, DEFAULT_MACRO_LIMITS).state).toBe('unreadable');
});

it('RF-154 reports a compound file with absurd header counts as unreadable', () => {
  const bytes = buildVbaProject({ modules: [{ name: 'M', kind: 'standard', source: BAS }] });
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

/** Points every chained sector of the FAT at itself, as a hostile file would. */
function makeChainLoop(bytes: Buffer): Buffer {
  const out = Buffer.from(bytes);
  const sectorSize = 512;
  const fatSector = out.readInt32LE(0x4c);
  const fatAt = (fatSector + 1) * sectorSize;
  for (let index = 0; index < sectorSize / 4; index++) {
    const next = out.readInt32LE(fatAt + index * 4);
    if (next >= 0) out.writeInt32LE(index, fatAt + index * 4);
  }
  return out;
}
