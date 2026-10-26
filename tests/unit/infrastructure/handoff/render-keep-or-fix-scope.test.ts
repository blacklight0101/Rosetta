import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { ClaimJudgement } from '../../../../src/domain/planning/claim-judgement.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { planTask } from '../../../support/task-card-fixtures.js';
import { ordersScreen } from '../../../support/ux-fixtures.js';

// P5-41 round 2, RF-631: a claim that narrowing removes from every card is listed in checks.md; a
// judgement of a claim that does not exist makes no question secure.

const masker = new SecretMasker();
const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

const claim = (id: string, text: string) => ({
  claimId: id,
  text,
  citations: [{ path: 'src/Page.cs', startLine: 1, endLine: 2 }],
  status: 'Supported' as const,
});

const card = (id: string, type: 'SCRN' | 'BR' | 'OQ', text: string) => ({
  ...{ id, type, title: id, summary: 'S.', area: 'a' },
  claims: [claim(`${id}.c1`, text)],
});

function narrowed(): Record<string, string> {
  const base = handoffOf('Plain text.');
  const requirement = base.content.requirements[0];
  if (requirement === undefined) throw new Error('The fixture has a requirement.');
  const handoff: HandoffPackage = {
    ...base,
    sources: [
      card('SCRN-001', 'SCRN', 'The first page lists orders.'),
      card('SCRN-002', 'SCRN', 'The second page lists refunds.'),
      card('BR-001', 'BR', 'A refund needs a reason.'),
    ],
    ux: {
      ...base.ux,
      screens: [
        { ...ordersScreen(), id: 'S-1', cards: ['SCRN-001'] },
        { ...ordersScreen(), id: 'S-2', cards: ['SCRN-002'] },
      ],
    },
    content: {
      ...base.content,
      requirements: [
        { ...requirement, id: 'REQ-001', sources: ['SCRN-001', 'SCRN-002'] },
        { ...requirement, id: 'REQ-002', sources: ['BR-001'] },
      ],
      tasks: [
        planTask({ id: 'T-001', requirements: ['REQ-001'], builds: ['screen:S-1'] }),
        planTask({ id: 'T-002', requirements: ['REQ-002'], builds: ['screen:S-2'] }),
      ],
    },
  };
  return { ...renderHandoff(handoff, masker) };
}

describe('claims that narrowing removes from every card', () => {
  it('P5-41 a claim of a card that only the first task cites, while the task that builds its screen cites another card, is listed as kept by no card', () => {
    const checks = plain(narrowed()['checks.md']);

    expect(checks).toContain('## Behaviour kept by no card');
    expect(checks).toContain('SCRN-002.c1');
    expect(checks).toContain('The second page lists refunds.');
  });

  it('P5-41 a claim a card keeps is not listed', () => {
    const checks = plain(narrowed()['checks.md']);

    expect(checks).not.toContain('SCRN-001.c1');
    expect(checks).not.toContain('BR-001.c1');
  });
});

describe('a judgement of a claim that does not exist', () => {
  const judged = (claimId: string): ClaimJudgement => ({
    ...{ claimId, kind: 'defect', security: true, reason: 'No role is checked.' },
  });

  function questions(judgement: ClaimJudgement): string {
    const base = handoffOf('Plain text.');
    const handoff: HandoffPackage = {
      ...base,
      sources: [card('OQ-001', 'OQ', 'No page checks the role.')],
      content: { ...base.content, judgements: [judgement] },
    };
    return plain(renderHandoff(handoff, masker)['open-questions.md']);
  }

  it('P5-41 a security judgement of a claim the card has makes its question secure', () => {
    expect(questions(judged('OQ-001.c1'))).toContain('Default: Use the secure option');
  });

  it('P5-41 a security judgement of a claim number the card does not have leaves the legacy default', () => {
    const text = questions(judged('OQ-001.c9'));
    const line = text.split('\n').find((each) => each.startsWith('- OQ-001:')) ?? '';

    expect(line).toContain('Default: Keep the legacy behaviour exactly');
  });
});
