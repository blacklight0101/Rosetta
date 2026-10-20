import { expect, it } from 'vitest';
import {
  DEFAULT_MACRO_LIMITS,
  type MacroLimits,
} from '../../../../../src/infrastructure/sources/workbook/macro-limits.js';
import { readMacroProject } from '../../../../../src/infrastructure/sources/workbook/macro-reader.js';
import {
  buildVbaProject,
  encrypt,
  protectionLine,
  type ProjectSpec,
} from '../../../../support/vba-project.js';

// RF-154: a VBA project is built in each test with `cfb` and a test-side compressor, read as text
// and never run. The hostile cases check that every length, count and offset of the file is bounded.

const BAS = 'Attribute VB_Name = "Module1"\r\nSub Run()\r\n  Shell "calc.exe"\r\nEnd Sub\r\n';

function read(spec: ProjectSpec, limits: MacroLimits = DEFAULT_MACRO_LIMITS) {
  return readMacroProject(buildVbaProject(spec), limits);
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

  expect(project.modules[0]?.source).toEqual({
    status: 'unreadable',
    reason: 'the text offset is past the end of the stream',
  });
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

const badVersion = `CMG="${encrypt(Buffer.from([4, 0, 0, 0]), 0x5a, 0x21, 5).toString('hex')}"`;

it('RF-154 reads a project whose protection state is clear', () => {
  const project = read({
    modules: [{ name: 'M', kind: 'standard', source: BAS }],
    projectLines: [protectionLine(0)],
  });

  expect(project.state).toBe('readable');
  expect(project.modules[0]?.source.status).toBe('text');
});

it.each([
  ['a wrong version', [badVersion]],
  ['text that is not hexadecimal', ['CMG="not hex at all"']],
  ['an empty value', ['CMG=""']],
  ['a second CMG line after a clear one', [protectionLine(0), protectionLine(0)]],
  ['a clear CMG line followed by a locked one', [protectionLine(0), protectionLine(4)]],
])(
  'RF-154 fails closed and takes a project with CMG as %s for a locked one (Q-40)',
  (_n, lines) => {
    const project = read({
      modules: [{ name: 'M', kind: 'standard', source: BAS }],
      projectLines: lines,
    });

    expect(project.state).toBe('locked');
    expect(project.modules[0]?.source).toEqual({ status: 'locked' });
  },
);

it('RF-154 takes any protection bit for a locked project', () => {
  const project = read({
    modules: [{ name: 'M', kind: 'standard', source: BAS }],
    projectLines: [protectionLine(0x01)],
  });

  expect(project.state).toBe('locked');
});
