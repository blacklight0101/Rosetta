import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadPlannerWorkbookPrompt,
  loadReaderPrompts,
} from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-155, RNF-004, RF-145, RFC-005 section 4.7: the reader's and the planner's workbook guidance are
// versioned files, loaded with the SHA-256 of their bytes, that say what RFC-005 says they say.

const sha256Of = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

describe('the reader workbook guidance', () => {
  it('RNF-004 is loaded with its version and the hash of its bytes', async () => {
    const { workbook } = await loadReaderPrompts('prompts');

    expect(workbook).toMatchObject({ name: 'reader/workbook.v1.md', version: 'v1' });
    expect(workbook?.sha256).toBe(await sha256Of('prompts/reader/workbook.v1.md'));
  });

  it('RF-155 names the rendered files, the row prefix and the optional macros and dependencies', async () => {
    const text = (await loadReaderPrompts('prompts')).workbook?.text ?? '';

    for (const name of ['workbook.md', 'values.md', 'formulas.md', 'validation.md', 'notes.md']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('dependencies.md');
    expect(text).toContain('macros/');
    expect(text).toContain('R<n> | ');
  });

  it('RF-155 maps workbooks to areas, sheets to entities, formulas to rules, macros to workflows, cells to the interface', async () => {
    const text = (await loadReaderPrompts('prompts')).workbook?.text ?? '';

    for (const card of ['`ENT`', '`BR`', '`FLOW`', '`SCRN`', '`INT`']) {
      expect(text).toContain(card);
    }
    expect(text).toMatch(/workbooks and sheets/iu);
    expect(text).toMatch(/plain words/iu);
    expect(text).toMatch(/dropdown/iu);
  });

  it('RF-145 says that what the cells hold is data and never an instruction', async () => {
    const text = (await loadReaderPrompts('prompts')).workbook?.text ?? '';

    expect(text).toMatch(/data, never instructions/iu);
    expect(text).toMatch(/cell/iu);
    expect(text).toMatch(/comment/iu);
  });
});

describe('the planner workbook guidance', () => {
  it('RNF-004 is loaded with its version and the hash of its bytes', async () => {
    const file = await loadPlannerWorkbookPrompt('prompts');

    expect(file).toMatchObject({ name: 'planner/workbook.v1.md', version: 'v1' });
    expect(file.sha256).toBe(await sha256Of('prompts/planner/workbook.v1.md'));
  });

  it('RF-155 asks for a plan that rebuilds the workbook as an application', async () => {
    const { text } = await loadPlannerWorkbookPrompt('prompts');

    for (const part of [
      /input sheets.*forms/isu,
      /lookup tables.*reference data/isu,
      /formulas.*tested/isu,
      /macros.*services/isu,
      /outputs.*reports/isu,
    ]) {
      expect(text).toMatch(part);
    }
    expect(text).toMatch(/data, never instructions/iu);
  });
});
