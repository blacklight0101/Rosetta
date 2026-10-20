import { expect, it } from 'vitest';
import type {
  MacroModule,
  MacroProject,
} from '../../../../../src/infrastructure/sources/workbook/macro-model.js';
import { renderWorkbook } from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import {
  entryOf,
  summaryOf,
} from '../../../../../src/infrastructure/sources/workbook/workbook-tree.js';
import { book, sheet } from '../../../../support/rendered-workbook-fixtures.js';

// RF-154, RF-150, Q-40: a workbook whose macros were skipped says so for the upload summary, with
// the way out; the counts of the record come from what was rendered.

const UNLOCK = 'unlock it in Excel and upload again';

const text = (name: string): MacroModule => ({
  name,
  kind: 'standard',
  extension: 'bas',
  source: { status: 'text', text: 'Sub A()\nEnd Sub' },
});
const without = (name: string, status: 'locked' | 'no-source' | 'unreadable'): MacroModule => ({
  name,
  kind: 'standard',
  extension: 'bas',
  source: status === 'unreadable' ? { status, reason: 'damaged' } : { status },
});

function rendered(modules: readonly MacroModule[], rest: Partial<MacroProject> = {}) {
  const macros: MacroProject = {
    state: 'readable',
    codePage: 1252,
    encoding: 'windows-1252',
    modules,
    formControls: [],
    ...rest,
  };
  return renderWorkbook(book([sheet('S')], { hasMacros: true, macros }));
}

it('RF-154 tells the upload summary how to read the macros of a locked project', () => {
  const locked = rendered([without('Secret', 'locked')], { state: 'locked' });

  expect(locked.macroNotice).toContain(UNLOCK);
});

it('RF-154 tells the upload summary the same for a module that holds compiled code only', () => {
  const compiled = rendered([text('Fine'), without('Old', 'no-source')]);

  expect(compiled.macroNotice).toContain(UNLOCK);
});

it('RF-154 has no notice for readable macros, and none for a workbook without macros', () => {
  expect(rendered([text('Fine')]).macroNotice).toBeUndefined();
  expect(renderWorkbook(book([sheet('S')])).macroNotice).toBeUndefined();
});

it('RF-152 records the macro counts of the render, not zeros', () => {
  const two = rendered([text('A'), text('B'), without('Old', 'no-source')]);
  const upload = { fileName: 'Book.xlsm', path: 'unused', size: 10 };

  const entry = entryOf(upload, 'sha256:0', two.folder, two);

  expect(entry.counts).toMatchObject({ macroModules: 2, macrosSkipped: 1 });
  expect(summaryOf(entry).macroModules).toBe(2);
});
