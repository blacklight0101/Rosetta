import { describe, expect, it } from 'vitest';
import { legacyFactsOf } from '../../../../src/domain/planning/application-kind.js';
import { buildBrief, type PlanningBrief } from '../../../../src/domain/planning/planning-brief.js';
import { proposeFor } from '../../../../src/domain/planning/stack-proposal.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';
import { oneStatement, webFormsFiles, winFormsFiles } from '../../../support/proposal-scans.js';

// P5-39, DEC-172, RF-609, RF-610: the kind of application, the proposed layers and the strategy check.

const stack = shippedCatalogue.stack;
const signals = stack.proposals.signals;

function briefOf(answers: Parameters<typeof buildBrief>[0]): PlanningBrief {
  return { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-10-24T09:00:00.000Z' };
}

const web = legacyFactsOf({ files: webFormsFiles, sqlStatements: [] }, signals);
const desktop = legacyFactsOf({ files: winFormsFiles, sqlStatements: oneStatement }, signals);
const desktopNoDatabase = legacyFactsOf({ files: winFormsFiles, sqlStatements: [] }, signals);

describe('legacyFactsOf: the extensions of the code map (P7-29)', () => {
  it('DEC-203 lists every extension of the code map, lower case, sorted and once', () => {
    expect(web.extensions).toEqual(['aspx', 'cs']);
  });
});

describe('legacyFactsOf: the kind from the code map', () => {
  it('RF-609 a page file makes a web application, even beside designer files', () => {
    expect(web.detected?.kind).toBe('web');
  });

  it('RF-609 forms with designer files and no page make a desktop application', () => {
    expect(desktop.detected?.kind).toBe('desktop');
    expect(desktop.database).toBe(true);
    expect(desktopNoDatabase.database).toBe(false);
  });

  it('RF-609 no signal finds no kind', () => {
    expect(legacyFactsOf({ files: [], sqlStatements: [] }, signals).detected).toBeUndefined();
  });
});

describe('proposeFor: the stack', () => {
  it('RF-609 a web brief with no stack gets a proposal for every layer the catalogue knows', () => {
    const made = proposeFor(briefOf({}), web, stack);

    expect(made.proposal.kind).toBe('web');
    expect(made.brief.stack.map((entry) => [entry.layer, entry.choice])).toEqual([
      ['language-runtime', 'C# on .NET'],
      ['backend-framework', 'ASP.NET Core Razor Pages'],
      ['front-end', 'Razor Pages'],
      ['database', 'SQL Server'],
      ['data-access', 'Dapper'],
      ['testing', 'xUnit'],
      ['hosting', 'IIS'],
    ]);
    expect(made.brief.stack.every((entry) => entry.proposed === true)).toBe(true);
  });

  it('RF-609 the owner choice is never changed and only open layers are proposed', () => {
    const owner = { layer: 'front-end', choice: 'React', custom: true } as const;
    const made = proposeFor(briefOf({ stack: [owner] }), web, stack);

    const frontEnd = made.brief.stack.find((entry) => entry.layer === 'front-end');
    expect(frontEnd).toEqual(owner);
    expect(made.proposal.layers.map((each) => each.layer)).not.toContain('front-end');
    expect(made.brief.stack).toHaveLength(7);
  });

  it('RF-609 a brief with a full stack proposes nothing', () => {
    const full = proposeFor(briefOf({}), web, stack).brief.stack.map((entry) => ({
      layer: entry.layer,
      choice: entry.choice,
      custom: false,
    }));
    const made = proposeFor(briefOf({ stack: full }), web, stack);

    expect(made.proposal.layers).toEqual([]);
    expect(made.brief.stack).toEqual(full);
  });
});

describe('proposeFor: the kind of application', () => {
  it('RF-609 a desktop application gets a desktop front end and an installer', () => {
    const made = proposeFor(briefOf({}), desktop, stack);

    const choices = new Map(made.brief.stack.map((entry) => [entry.layer, entry.choice]));
    expect(choices.get('front-end')).toBe('Windows Forms on .NET');
    expect(choices.get('hosting')).toBe('MSIX installer');
    expect(choices.has('backend-framework')).toBe(false);
  });

  it('RF-609 the owner answer to the kind wins over the code map', () => {
    const made = proposeFor(briefOf({ application: 'service' }), web, stack);

    expect(made.proposal.kind).toBe('service');
    expect(made.proposal.kindFrom).toBe('owner');
  });

  it('RF-609 keep as is proposes no layer', () => {
    expect(proposeFor(briefOf({ application: 'keep' }), web, stack).proposal.layers).toEqual([]);
  });
});

describe('proposeFor: the migration strategy against the kind', () => {
  it('RF-610 a desktop client with a shared database keeps the strangler fig and gets the database as seam', () => {
    const { proposal, brief } = proposeFor(briefOf({}), desktop, stack);

    expect(brief.migration).toBe('strangler-fig');
    expect(proposal.fit.seam).toBe('shared-database');
    expect(proposal.fit.reason).toContain('no request reaches it');
  });

  it('RF-610 a desktop client with no database and the default strategy gets a rewrite, with its reason', () => {
    const { proposal, brief } = proposeFor(briefOf({}), desktopNoDatabase, stack);

    expect(brief.migration).toBe('rewrite');
    expect(proposal.fit.changedFrom).toBe('strangler-fig');
    expect(proposal.fit.reason).toContain('single cut-over');
  });

  it('RF-610 a strangler fig the owner chose is kept and the misfit is a finding', () => {
    const { proposal, brief } = proposeFor(
      briefOf({ migration: 'strangler-fig' }),
      desktopNoDatabase,
      stack,
    );

    expect(brief.migration).toBe('strangler-fig');
    expect(proposal.fit.finding).not.toBeNull();
  });

  it('RF-610 a web application keeps the strangler fig without a note', () => {
    const { proposal } = proposeFor(briefOf({}), web, stack);

    expect(proposal.fit.reason).toBe('');
    expect(proposal.fit.seam).toBeNull();
  });
});

describe('proposeFor: the strategy fit with an own migration answer (DEC-184)', () => {
  const own = briefOf({ typed: { migration: 'Move one module a week behind a feature flag.' } });

  it('RF-645 the default strategy is checked only as the reference: no seam record, a finding instead', () => {
    const { proposal, brief } = proposeFor(own, desktop, stack);

    expect(brief.migration).toBe('strangler-fig');
    expect(proposal.fit.seam).toBeNull();
    expect(proposal.fit.changedFrom).toBeNull();
    expect(proposal.fit.finding).toContain('no request reaches it');
    expect(proposal.fit.finding).toContain('database');
  });

  it('RF-645 with no database the default is not changed to a rewrite and the misfit is a finding', () => {
    const { proposal, brief } = proposeFor(own, desktopNoDatabase, stack);

    expect(brief.migration).toBe('strangler-fig');
    expect(proposal.fit.changedFrom).toBeNull();
    expect(proposal.fit.finding).toContain('no shared database');
  });
});
