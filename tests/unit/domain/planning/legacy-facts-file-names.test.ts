import { describe, expect, it } from 'vitest';
import { legacyFactsOf } from '../../../../src/domain/planning/application-kind.js';
import { webFormsFiles } from '../../../support/proposal-scans.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// P8-14, P7-29: the facts of a code map list the file names (lower case, sorted, bounded), so the
// stack offer can tell .NET Framework from its project files, which have no extension of their own.

const signals = shippedCatalogue.stack.proposals.signals;

describe('legacyFactsOf: file names', () => {
  it('P8-14 lists the lower-case base names once each, in code-unit order', () => {
    const [first] = webFormsFiles;
    if (first === undefined) throw new Error('no fixture file');
    const files = [
      ...webFormsFiles,
      { ...first, path: 'Web/App/Packages.config' },
      { ...first, path: 'Other/packages.config' },
    ];

    const facts: Record<string, unknown> = {
      ...legacyFactsOf({ files, sqlStatements: [] }, signals),
    };

    expect(facts['fileNames']).toEqual([
      'default.aspx',
      'default.aspx.cs',
      'default.aspx.designer.cs',
      'packages.config',
    ]);
  });
});
