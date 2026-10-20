import { expect, it } from 'vitest';
import type {
  MacroModule,
  MacroProject,
} from '../../../../../src/infrastructure/sources/workbook/macro-model.js';
import { renderWorkbook } from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { book, fileOf, linesOf, sheet } from '../../../../support/rendered-workbook-fixtures.js';

// RF-154, RF-152, Q-40, RFC-005 sections 4.4 and 4.6: macros are written as text files under
// `macros/`, each line starting with its line number, and listed in `workbook.md`.

const moduleOf = (
  name: string,
  text: string,
  kind: MacroModule['kind'] = 'standard',
): MacroModule => ({
  name,
  kind,
  extension: kind === 'standard' ? 'bas' : 'cls',
  source: { status: 'text', text },
});

function projectOf(
  modules: readonly MacroModule[],
  rest: Partial<MacroProject> = {},
): MacroProject {
  return {
    state: 'readable',
    codePage: 1252,
    encoding: 'windows-1252',
    modules,
    formControls: [],
    ...rest,
  };
}

const withMacros = (macros: MacroProject) =>
  renderWorkbook(book([sheet('S')], { hasMacros: true, macros }));

it('RF-154 writes a standard module as .bas and a class, sheet and workbook module as .cls', () => {
  const rendered = withMacros(
    projectOf([
      moduleOf('Module1', 'Sub A()\r\nEnd Sub'),
      moduleOf('ThisWorkbook', 'Option Explicit', 'document'),
      moduleOf('Class1', "' class", 'class'),
      moduleOf('UserForm1', "' form", 'form'),
    ]),
  );

  const paths = rendered.files.map((file) => file.path).filter((path) => path.includes('/macros/'));
  expect(paths).toEqual([
    'Book.xlsx/macros/Class1.cls',
    'Book.xlsx/macros/Module1.bas',
    'Book.xlsx/macros/ThisWorkbook.cls',
    'Book.xlsx/macros/UserForm1.cls',
  ]);
  expect(fileOf(rendered, 'macros/Module1.bas')).toBe('L1 | Sub A()\nL2 | End Sub\n');
});

it('RF-154 starts every line of a module with its number, cuts nothing and keeps lines short', () => {
  const long = 'x'.repeat(5000);
  const rendered = withMacros(projectOf([moduleOf('Big', `first\n${long}\nlast`)]));

  const lines = linesOf(fileOf(rendered, 'macros/Big.bas')).filter((line) => line !== '');

  for (const line of lines) {
    expect(line.length).toBeLessThan(1900);
    expect(line).toMatch(/^L[0-9]+ \| /u);
  }
  expect(lines[0]).toBe('L1 | first');
  expect(lines.at(-1)).toBe('L3 | last');
  const middle = lines.filter((line) => line.startsWith('L2 | ')).join('');
  expect(middle.replaceAll('L2 | ', '')).toBe(long);
});

it('RF-154 gives modules safe distinct file names and maps them back in workbook.md', () => {
  const rendered = withMacros(
    projectOf([
      moduleOf('CON', 'a'),
      moduleOf('my/mod', 'b'),
      moduleOf('Data', 'c'),
      moduleOf('data', 'd', 'class'),
      moduleOf('M'.repeat(100), 'e'),
    ]),
  );

  const paths = rendered.files.map((file) => file.path).filter((path) => path.includes('/macros/'));
  expect(paths).toContain('Book.xlsx/macros/_CON.bas');
  expect(paths).toContain('Book.xlsx/macros/my_mod.bas');
  expect(paths).toContain('Book.xlsx/macros/Data.bas');
  expect(paths).toContain('Book.xlsx/macros/data~2.cls');
  expect(paths.some((path) => path.endsWith(`${'M'.repeat(64)}.bas`))).toBe(true);
  const workbook = fileOf(rendered, 'workbook.md');
  expect(workbook).toContain('| macros/_CON.bas | macro | "CON" |');
  expect(workbook).toContain('| macros/data~2.cls | macro | "data" |');
});

it('RF-154 lists modules with kind and line count, and the form controls, in workbook.md', () => {
  const rendered = withMacros(
    projectOf([moduleOf('Module1', 'a\nb\nc'), moduleOf('UserForm1', 'x', 'form')], {
      formControls: [{ form: 'UserForm1', name: 'OkButton', type: 'CommandButton' }],
    }),
  );

  const workbook = fileOf(rendered, 'workbook.md');

  expect(workbook).toContain('| macros/Module1.bas | standard | 3 | written |');
  expect(workbook).toContain('| macros/UserForm1.cls | form | 1 | written |');
  expect(workbook).toContain('- "UserForm1" "OkButton": "CommandButton"');
  expect(workbook).not.toContain('not read yet');
});

it('RF-154 says plainly that a locked project is named and skipped (Q-40)', () => {
  const rendered = withMacros(
    projectOf(
      [{ name: 'Secret', kind: 'standard', extension: 'bas', source: { status: 'locked' } }],
      { state: 'locked', name: 'VBAProject' },
    ),
  );

  const workbook = fileOf(rendered, 'workbook.md');

  expect(workbook).toContain('- The VBA project "VBAProject" is locked for viewing');
  expect(workbook).toContain('| - | standard | - | skipped, project locked | "Secret" |');
  expect(rendered.files.some((file) => file.path.includes('/macros/'))).toBe(false);
  expect(rendered.counts).toMatchObject({ macroModules: 0, macrosSkipped: 1 });
});

it('RF-154 says when a project is unreadable or a module holds only compiled code', () => {
  const unreadable = fileOf(
    withMacros(projectOf([], { state: 'unreadable', reason: 'the directory stream is damaged' })),
    'workbook.md',
  );
  expect(unreadable).toContain(
    '- The VBA project could not be read: "the directory stream is damaged"',
  );

  const compiled = withMacros(
    projectOf([
      { name: 'Old', kind: 'standard', extension: 'bas', source: { status: 'no-source' } },
    ]),
  );
  expect(fileOf(compiled, 'workbook.md')).toContain(
    '| - | standard | - | skipped, compiled code only | "Old" |',
  );
  expect(compiled.counts).toMatchObject({ macroModules: 0, macrosSkipped: 1 });
});

it('RF-154 counts the written modules and renders a workbook without macros as before', () => {
  const rendered = withMacros(projectOf([moduleOf('A', 'x'), moduleOf('B', 'y')]));
  expect(rendered.counts).toEqual({
    sheets: 1,
    nonEmptyCells: 0,
    formulas: 0,
    macroModules: 2,
    macrosSkipped: 0,
  });
  const plain = renderWorkbook(book([sheet('S')]));
  expect(plain.files.some((file) => file.path.includes('/macros/'))).toBe(false);
  expect(fileOf(plain, 'workbook.md')).toContain('- No VBA project.');
  expect(plain.counts).toMatchObject({ macroModules: 0, macrosSkipped: 0 });
});
