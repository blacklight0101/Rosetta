import { describe, expect, it } from 'vitest';
import { buildBrief } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-645, RF-605 (P8-22, UX-02): a stack choice that is not among the options the page offered is
// stored as the owner's own answer, so the stored brief and the page agree.

const stackOf = (
  choice: string,
  extra: { custom: boolean; offered?: string[] },
): ReturnType<typeof buildBrief>['stack'] =>
  buildBrief({ stack: [{ layer: 'database', choice, ...extra }] }, shippedCatalogue).stack;

describe('buildBrief: the custom flag of a stack choice', () => {
  it('RF-645 keeps custom false for a choice among the offered options', () => {
    const [entry] = stackOf('SQL Server', { custom: false, offered: ['SQL Server', 'PostgreSQL'] });

    expect(entry?.custom).toBe(false);
  });

  it('RF-645 stores custom true for a choice that is not among the offered options', () => {
    const [entry] = stackOf('SQL Server 2022', { custom: false, offered: ['PostgreSQL'] });

    expect(entry).toMatchObject({ choice: 'SQL Server 2022', custom: true });
  });

  it('RF-645 leaves a choice with no recorded options as it was sent', () => {
    const [entry] = stackOf('SQL Server 2022', { custom: false });

    expect(entry?.custom).toBe(false);
  });

  it('RF-645 treats an empty list of offered options as no record, so the choice stays a pick', () => {
    const [entry] = stackOf('SQL Server 2022', { custom: false, offered: [] });

    expect(entry).toMatchObject({ choice: 'SQL Server 2022', custom: false });
  });
});
