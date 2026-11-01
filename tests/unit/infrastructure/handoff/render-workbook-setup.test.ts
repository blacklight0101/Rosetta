import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { buildBrief, type BriefAnswers } from '../../../../src/domain/planning/planning-brief.js';
import { workbookSetup } from '../../../../src/domain/planning/workbook-setup.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-648, RF-649, RF-650, RF-622, RF-625, RF-626, DEC-150: what the package of a workbook says of the
// sign-in, the secrets store and the screens, and that a package of any other source is unchanged.

const masker = new SecretMasker();

function control(name: string, description: string) {
  return {
    ...{ name, approach: 'other' as const, description, invariant: '', alternative: '' },
    ...{ sources: ['FEAT-001'], decision: '' },
  };
}

function workbookPackage(answers: BriefAnswers = {}): HandoffPackage {
  const base = handoffOf('Plain text.');
  const brief = { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-11-01T09:00:00.000Z' };
  return {
    ...base,
    brief,
    workbook: workbookSetup(brief),
    content: {
      ...base.content,
      technical: {
        ...base.content.technical,
        security: [
          control('Staff sign in', 'Staff must sign in before they edit a register.'),
          control('Secrets handling', 'Credentials found in the workbooks are stored safely.'),
          control('Audit trail', 'Every change is logged.'),
        ],
      },
    },
  };
}

const files = (handoff: HandoffPackage) => renderHandoff(handoff, masker);

describe('trd.md of a workbook package', () => {
  it('RF-648 RF-649 names the sign-in and the store instead of "Approach: other"', () => {
    const trd =
      files(workbookPackage({ chosen: { 'workbook.signIn': 'accounts' } }))['trd.md'] ?? '';
    const section = trd.slice(trd.indexOf('## Security and data protection'));

    expect(section).toContain('Sign-in: Accounts of the application');
    expect(section).toContain('Secrets store: The secret store of the hosting platform');
    expect(section).toContain('Approach: Accounts of the application.');
    expect(section).toContain('Approach: The secret store of the hosting platform.');
    expect(section).toContain('Approach: other.');
    expect(section.match(/Approach: other\./gu)).toHaveLength(1);
  });

  it('RF-648 a package of a repository keeps "Approach: other" and has no sign-in line', () => {
    const base = workbookPackage();
    const repository = { ...base, workbook: undefined };
    const trd = files(repository)['trd.md'] ?? '';

    expect(trd.match(/Approach: other\./gu)).toHaveLength(3);
    expect(trd).not.toContain('Sign-in:');
    expect(trd).not.toContain('Secrets store:');
  });
});

describe('ux/ and flows/ of a workbook package', () => {
  it('RF-650 ux lists one screen set per table with its fields', () => {
    const ux = files(workbookPackage())['ux/README.md'] ?? '';

    for (const table of ['customer', 'customer_order']) {
      expect(ux).toContain(`List ${table}`);
      expect(ux).toContain(`Edit ${table}`);
      expect(ux).toContain(`Search ${table}`);
    }
    expect(ux).toContain('email');
    expect(ux).toContain('customer_id');
  });

  it('RF-650 list and search screens only leave out the edit screen', () => {
    const ux =
      files(workbookPackage({ chosen: { 'workbook.screens': 'read-only' } }))['ux/README.md'] ?? '';

    expect(ux).toContain('List customer');
    expect(ux).toContain('Search customer');
    expect(ux).not.toContain('Edit customer');
  });

  it('RF-650 no screens says that none was asked for', () => {
    const out = files(workbookPackage({ chosen: { 'workbook.screens': 'none' } }));

    expect(out['ux/README.md']).toContain('No screen was asked for');
    expect(out['ux/README.md']).not.toContain('List customer');
    expect(out['flows/README.md']).toContain('No screen was asked for');
  });

  it('RF-650 flows lists a sign-in journey and one journey per table', () => {
    const flows =
      files(workbookPackage({ chosen: { 'workbook.signIn': 'windows' } }))['flows/README.md'] ?? '';

    expect(flows).toContain('Sign in with Windows authentication');
    expect(flows).toContain('Find, add and change customer');
    expect(flows).toContain('Find, add and change customer_order');
  });

  it('RF-650 a package of a repository has no screen set and no workbook journey', () => {
    const repository = { ...workbookPackage(), workbook: undefined };
    const out = files(repository);

    expect(out['ux/README.md']).not.toContain('List customer');
    expect(out['flows/README.md']).not.toContain('Sign in with');
  });
});
