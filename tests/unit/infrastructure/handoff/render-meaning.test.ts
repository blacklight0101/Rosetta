import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { emptyPrd } from '../../../../src/domain/planning/prd-content.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// P5-43, RF-602, RF-507: checks.md lists where the plan changed the meaning of its claims, in a
// section of its own; the PRD marks a role no claim states as proposed.

const masker = new SecretMasker();
const meaning = {
  contradictions: [
    { where: 'REQ-001', claimId: 'FEAT-001.c1', statement: 'removes it', claim: 'archives it' },
  ],
  unstatedValues: [{ where: 'REQ-002', value: '20' }],
  unstatedRoles: [{ where: 'PRD roles', role: 'Administrator' }],
  proposedRoles: ['Administrator'],
  overruled: [
    {
      documentClaimId: 'DOC-001.c1',
      codeClaimId: 'FEAT-003.c1',
      document: 'a week',
      code: 'a month',
    },
  ],
};

describe('P5-43 the meaning section of checks.md', () => {
  const prd = {
    ...emptyPrd,
    roles: [{ name: 'Administrator', description: 'Manages.', sources: ['FEAT-001'] }],
  };
  const files = renderHandoff({ ...handoffOf('Plain text.', prd), meaning }, masker);

  it('RF-602 lists each kind of finding', () => {
    const checks = files['checks.md'] ?? '';

    expect(checks).toContain('## Meaning of the source claims');
    expect(checks).toContain(
      'REQ-001: the statement says it removes it; FEAT-001.c1 says it archives it.',
    );
    expect(checks).toContain('REQ-002: "20"');
    expect(checks).toContain('PRD roles: Administrator');
    expect(checks).toContain('DOC-001.c1 (a week) overruled by FEAT-003.c1 (a month).');
  });

  it('RF-602 the PRD marks the role as proposed', () => {
    expect(files['prd.md']).toContain('**Administrator** (proposed: no claim states this role)');
  });

  it('RF-602 a package with no finding has no section', () => {
    const quiet = renderHandoff(handoffOf('Plain text.'), masker);

    expect(quiet['checks.md']).not.toContain('Meaning of the source claims');
  });
});
