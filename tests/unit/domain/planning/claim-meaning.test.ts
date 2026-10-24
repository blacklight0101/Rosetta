import { describe, expect, it } from 'vitest';
import { claimMeaning } from '../../../../src/domain/planning/claim-meaning.js';
import { codeOverDocumentation } from '../../../../src/domain/planning/code-over-documentation.js';
import { noFlows } from '../../../../src/domain/planning/target-flows.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import { emptyPrd, type PrdContent } from '../../../../src/domain/planning/prd-content.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// P5-43, RF-602: a plan statement keeps the meaning of its source claims.

const verbs = shippedCatalogue.claimVerbs;

function card(id: string, texts: readonly string[], path = 'src/Appointments.cs'): SourceCard {
  return {
    ...{ id, type: 'FEAT', title: `Title ${id}`, summary: 'Summary.', area: 'appointments' },
    claims: texts.map((text, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text,
      citations: [{ path, startLine: 1, endLine: 2 }],
      status: 'Supported' as const,
    })),
  };
}

function planOf(statement: string): ReturnType<typeof assemblePlan> {
  return assemblePlan(
    {
      summary: 'A web application.',
      requirements: [{ title: 'Pending appointments', statement, sources: ['FEAT-001'] }],
      components: [],
      decisions: [],
      entities: [],
      phases: [],
      tasks: [],
      risks: [],
      technical: { integrations: [], security: [], targets: [], environments: [] },
    },
    new Set(['FEAT-001']),
  );
}

function check(
  statement: string,
  cards: SourceCard[],
  prd: PrdContent = emptyPrd,
): ReturnType<typeof claimMeaning> {
  const plan = planOf(statement).content;
  return claimMeaning({ plan, prd, flows: noFlows, sources: cards, overruled: [] }, verbs);
}

const rejects = card('FEAT-001', ['Reject sets the status of the appointment to rejected.']);

describe('P5-43 verbs that contradict the claim', () => {
  it('RF-602 a claim that sets status rejected and a requirement that deletes is listed', () => {
    const found = check('A doctor can delete the appointment.', [rejects]);

    expect(found.contradictions).toEqual([
      {
        where: 'REQ-001',
        claimId: 'FEAT-001.c1',
        statement: 'removes it',
        claim: 'marks its status or archives it',
      },
    ]);
  });

  it('RF-602 a requirement that keeps the verb of the claim is not listed', () => {
    expect(check('A doctor can reject the appointment.', [rejects]).contradictions).toEqual([]);
  });

  it('RF-602 a claim on the same topic that states the verb settles it', () => {
    const both = card('FEAT-001', [
      'Reject sets the status of the appointment to rejected.',
      'Delete removes the appointment row.',
    ]);

    expect(check('A doctor can delete the appointment.', [both]).contradictions).toEqual([]);
  });

  it('RF-602 a claim about another topic does not contradict', () => {
    const other = card('FEAT-001', ['Reject sets the status of the invoice to rejected.']);

    expect(check('A doctor can delete the appointment.', [other]).contradictions).toEqual([]);
  });

  it('RF-602 record against ignore is listed', () => {
    const ignores = card('FEAT-001', ['The rating of the appointment is ignored.']);

    const found = check('The system records the rating of the appointment.', [ignores]);

    expect(found.contradictions.map((each) => each.claim)).toEqual(['ignores or discards it']);
  });
});

describe('P5-43 values and roles no claim states', () => {
  it('RF-602 a number or quoted value no claim states is listed', () => {
    const found = check('Show the top 20 appointments with status "Approved".', [rejects]);

    expect(found.unstatedValues.map((each) => each.value)).toEqual(['20', 'approved']);
  });

  it('RF-602 a value the claim states is not listed', () => {
    const stated = card('FEAT-001', ['The grid shows the top 20 appointments.']);

    expect(check('Show the top 20 appointments.', [stated]).unstatedValues).toEqual([]);
  });

  it('RF-602 a PRD role no claim states is proposed, and a statement naming it is listed', () => {
    const prd: PrdContent = {
      ...emptyPrd,
      roles: [{ name: 'Administrator', description: 'Manages all.', sources: ['FEAT-001'] }],
    };

    const found = check('The administrator can reject the appointment.', [rejects], prd);

    expect(found.proposedRoles).toEqual(['Administrator']);
    expect(found.unstatedRoles).toEqual([
      { where: 'PRD roles', role: 'Administrator' },
      { where: 'REQ-001', role: 'Administrator' },
    ]);
  });

  it('RF-602 a role a claim states is not proposed', () => {
    const doctor = card('FEAT-001', ['A doctor rejects the appointment.']);
    const prd: PrdContent = {
      ...emptyPrd,
      roles: [{ name: 'Doctors', description: 'Treat patients.', sources: ['FEAT-001'] }],
    };

    expect(check('A doctor can reject the appointment.', [doctor], prd).proposedRoles).toEqual([]);
  });
});

describe('P5-43 code claims win over documentation claims', () => {
  const readme = card(
    'DOC-001',
    ['The administrator sees the weekly appointments view.'],
    'README.md',
  );
  const code = card('FEAT-003', ['The view lists the appointments of the current month.']);

  it('RF-602 the documentation claim is dropped and both are listed', () => {
    const result = codeOverDocumentation([readme, code], verbs);

    expect(result.cards.map((each) => each.id)).toEqual(['FEAT-003']);
    expect(result.overruled).toEqual([
      {
        documentClaimId: 'DOC-001.c1',
        codeClaimId: 'FEAT-003.c1',
        document: 'covers a week',
        code: 'covers a month',
      },
    ]);
  });

  it('RF-602 documentation that nothing in the code contradicts stays', () => {
    const quiet = card('FEAT-004', ['The view lists the users.']);

    expect(codeOverDocumentation([readme, quiet], verbs).cards).toHaveLength(2);
  });
});
