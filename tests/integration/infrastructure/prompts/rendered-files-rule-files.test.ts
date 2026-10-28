import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { renderRepairRequest } from '../../../../src/application/cards/repair-request.js';
import { valuesOnlyRuleProblems } from '../../../../src/application/cards/rule-citations.js';
import {
  loadPromptFile,
  loadReaderPrompts,
} from '../../../../src/infrastructure/prompts/prompt-files.js';
import { loadVerifierPrompts } from '../../../../src/infrastructure/prompts/verifier-prompt-files.js';
import { draftOf } from '../../../support/card-fixtures.js';

// P3-105, RNF-004, RF-145, EV-08, EV-11: the rendered files are Rosetta's view of a workbook. The
// reader prompt, the verifier prompt and the repair prompt say so in new versions, the defaults
// switch to them, and the old versions stay as they were for the runs that used them.

const sha256Of = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

describe('the reader workbook guidance v5', () => {
  it('RNF-004 is the default, and v4 stays without the rule', async () => {
    const { workbook } = await loadReaderPrompts('prompts');
    const old = await loadPromptFile('prompts', 'reader/workbook.v4.md');

    expect(workbook).toMatchObject({ name: 'reader/workbook.v5.md', version: 'v5' });
    expect(workbook?.sha256).toBe(await sha256Of('prompts/reader/workbook.v5.md'));
    expect(old.text).not.toMatch(/never part of the workbook/iu);
  });

  it("RF-155 says the rendered files are Rosetta's view, never part of the workbook, never a claim", async () => {
    const text = (await loadReaderPrompts('prompts')).workbook?.text ?? '';

    expect(text).toMatch(/Rosetta's view of the workbook/u);
    expect(text).toMatch(/never\s+part of the workbook/u);
    expect(text).toMatch(/Never write a card or a claim about them/u);
    expect(text).toMatch(/do not name a rendered file in the text of\s+a claim/u);
  });

  it('RF-155 cites a rule at formulas.md or the macro module, never at values.md', async () => {
    const text = (await loadReaderPrompts('prompts')).workbook?.text ?? '';

    expect(text).toMatch(
      /cited in `formulas\.md` \(or, for a macro, in the module file\), never\s+in `values\.md`/u,
    );
    expect(text).toMatch(/cited in the module file\s+of `macros\/`/u);
  });
});

describe('the verifier claim prompt v3', () => {
  it('RNF-004 is the default, and v1 stays without the rule', async () => {
    const { system } = await loadVerifierPrompts('prompts');
    const old = await loadPromptFile('prompts', 'verifier/claim.v1.md');

    expect(system).toMatchObject({ name: 'verifier/claim.v5.md', version: 'v5' });
    expect(old.text).not.toMatch(/Rosetta rendered/u);
  });

  it('RF-301 rejects a claim about the rendered files as if they were part of the system', async () => {
    const { system } = await loadVerifierPrompts('prompts');

    expect(system.text).toMatch(
      /Answer `Rejected` when the claim is about the files Rosetta rendered/u,
    );
    for (const name of ['workbook.md', 'values.md', 'formulas.md', 'workbook-formulas.md']) {
      expect(system.text).toContain(name);
    }
  });
});

describe('the repair prompt v3 and the question it carries', () => {
  it('RNF-004 is the default, and v2 stays without the workbook paragraph', async () => {
    const { repair } = await loadReaderPrompts('prompts');
    const old = await loadPromptFile('prompts', 'cards/repair.v2.md');

    expect(repair).toMatchObject({ name: 'cards/repair.v4.md', version: 'v4' });
    expect(old.text).not.toMatch(/formulas\.md/u);
    expect(repair.text).toMatch(/formulas\.md/u);
  });

  it('RF-208 renders the formula question for a rule that cites only values', async () => {
    const { repair } = await loadReaderPrompts('prompts');
    const vat = draftOf({
      type: 'BR',
      title: 'VAT to Pay Calculation',
      claims: [
        {
          text: 'The VAT to Pay (AA) is calculated based on the Net Amount.',
          citations: [
            { path: 'Invoice_Generator.xlsm/Invoice/values.md', startLine: 8, endLine: 8 },
          ],
        },
      ],
    });

    const message = renderRepairRequest(
      repair.text,
      valuesOnlyRuleProblems([vat], ['Invoice_Generator.xlsm']),
    );

    expect(message).toContain('VAT to Pay Calculation');
    expect(message).toContain('formulas.md');
    expect(message).not.toContain('{{problems}}');
  });
});
