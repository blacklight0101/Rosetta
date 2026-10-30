import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// P7-13, RF-627, EV-74: checks.md "Left out" lists only what the model dropped; a check on a part
// the model keeps is in its own "Data model" section.

const masker = new SecretMasker();
const sectionHeading = /^## Data model$/mu;
const where = { area: 'Data model', field: 'table t columns' };
const dropped = { ...where, item: 'field_1', reason: 'It is a placeholder.' };
const check = {
  ...{ ...where, item: 'quantity', reason: 'The type is deprecated.' },
  kind: 'check' as const,
};

function checksOf(leftOut: HandoffPackage['leftOut']): string {
  return renderHandoff(handoffOf('Plain text.', undefined, { leftOut }), masker)['checks.md'] ?? '';
}

describe('checks.md: the Data model section', () => {
  it('RF-627 lists a check apart from "Left out"', () => {
    const checks = checksOf([dropped, check]);

    const [before = '', after = ''] = checks.split('## Left out');
    expect(before).toMatch(sectionHeading);
    expect(before).toContain('`quantity`');
    expect(after).toContain('`field_1`');
    expect(after).not.toContain('quantity');
  });

  it('RF-627 has no "Left out" section when everything listed is a check', () => {
    const checks = checksOf([check]);

    expect(checks).toMatch(sectionHeading);
    expect(checks).not.toContain('## Left out');
  });

  it('RF-627 has no Data model section when no check is listed', () => {
    expect(checksOf([dropped])).not.toMatch(sectionHeading);
  });
});
