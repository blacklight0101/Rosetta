import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { ClaimJudgement } from '../../../../src/domain/planning/claim-judgement.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { dangerousIn } from '../../../support/render-markdown.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-631, P5-41, DEC-11: the task cards, risks.md, open-questions.md and checks.md say which claims
// are kept, which a decision or an answer changes, which are likely defects to keep or fix (default
// fix, a security question defaults to the secure option), and which acceptance criteria contradict
// a kept claim.

const masker = new SecretMasker();

const claim = (id: string, text: string) => ({
  claimId: id,
  text,
  citations: [{ path: 'src/Login.cs', startLine: 10, endLine: 12 }],
  status: 'Supported' as const,
});

const sources: HandoffPackage['sources'] = [
  {
    ...{ id: 'FEAT-001', type: 'FEAT', title: 'Sign in', summary: 'Sign in.', area: 'users' },
    claims: [
      claim('FEAT-001.c1', 'The password is compared in plain text.'),
      claim('FEAT-001.c2', 'A signed-in user sees the home page.'),
      claim('FEAT-001.c3', 'The receipt date is the fixed value 20 may 2016.'),
    ],
  },
  {
    ...{ id: 'OQ-001', type: 'OQ', title: 'Roles', summary: 'Roles.', area: 'users' },
    claims: [claim('OQ-001.c1', 'No page checks the role of the user.')],
  },
];

function judged(overrides: Partial<ClaimJudgement>): ClaimJudgement {
  return {
    ...{ claimId: 'FEAT-001.c1', kind: 'change', decisionId: 'ADR-001', security: false },
    ...{ reason: 'The decision hashes passwords.' },
    ...overrides,
  };
}

function filesOf(
  judgements: readonly ClaimJudgement[],
  extra: Partial<HandoffPackage> = {},
  task: Partial<HandoffPackage['content']['tasks'][number]> = {},
): Record<string, string> {
  const base = handoffOf('Plain text.');
  const [first] = base.content.tasks;
  if (first === undefined) throw new Error('The fixture has a task.');
  const handoff: HandoffPackage = {
    ...base,
    sources,
    content: { ...base.content, judgements, tasks: [{ ...first, ...task }] },
    ...extra,
  };
  return { ...renderHandoff(handoff, masker) };
}

const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

function firstCard(files: Record<string, string>): string {
  return plain(files['tasks.md']).split(/^## /mu)[1] ?? '';
}

describe('behaviour to change on a task card', () => {
  it('RF-631 a kept claim that a decision changes is listed under behaviour to change, naming the decision', () => {
    const card = firstCard(filesOf([judged({})]));

    expect(card).toContain('Behaviour to change:');
    expect(card).toMatch(/FEAT-001\.c1: The password is compared in plain text\..*\[ADR-001\]/u);
    expect(card).toContain('decisions/ADR-001.md');
  });

  it('RF-631 a changed claim is not pinned: no approval test is asked for it', () => {
    const card = firstCard(filesOf([judged({})]));

    expect(card).not.toContain('pin FEAT-001.c1 against');
    expect(card).toContain('pin FEAT-001.c2 against');
  });

  it('RF-631 a claim that an answer changes names the question', () => {
    const card = firstCard(filesOf([judged({ decisionId: undefined, answerCard: 'OQ-001' })]));

    expect(card).toContain('the owner answer to OQ-001');
  });

  it('RF-631 mutation: with no judgement every claim is under behaviour to keep', () => {
    const card = firstCard(filesOf([]));

    expect(card).not.toContain('Behaviour to change:');
    expect(card).not.toContain('Keep or fix');
    expect(card).toContain('pin FEAT-001.c1 against');
    expect(card).toContain('pin FEAT-001.c3 against');
  });
});

const defect = judged({
  ...{ claimId: 'FEAT-001.c3', kind: 'defect', decisionId: undefined },
  reason: 'A fixed date is written for every receipt.',
});

describe('keep or fix', () => {
  it('P5-41 a claim judged a defect is a keep-or-fix row of risks.md with a default of fix', () => {
    const risks = plain(filesOf([defect])['risks.md']);

    expect(risks).toContain('## Keep or fix');
    expect(risks).toContain('| KF-001 |');
    expect(risks).toContain('FEAT-001.c3');
    expect(risks).toContain('The receipt date is the fixed value 20 may 2016.');
    expect(risks).toContain('A fixed date is written for every receipt.');
    expect(risks).toMatch(/\| KF-001 \|.*\| Fix \|/u);
  });

  it('P5-41 the task card lists it as keep or fix and asks for no approval test', () => {
    const card = firstCard(filesOf([defect]));

    expect(card).toContain('Keep or fix (the default is fix');
    expect(card).toContain('KF-001');
    expect(card).not.toContain('pin FEAT-001.c3 against');
    expect(card).toContain('risks.md#keep-or-fix');
  });

  it('P5-41 each row has an open question with the default fix', () => {
    const questions = plain(filesOf([defect])['open-questions.md']);

    expect(questions).toContain('## Keep or fix');
    expect(questions).toMatch(/KF-001.*Default: Fix/u);
  });

  it('P5-41 no row and no section when no claim is judged a defect', () => {
    const files = filesOf([judged({})]);

    expect(plain(files['risks.md'])).not.toContain('Keep or fix');
    expect(plain(files['open-questions.md'])).not.toContain('## Keep or fix');
  });
});

describe('keep or fix, the other cases', () => {
  it('ADR-005 a claim is never deleted: the judged claim is still in sources.md', () => {
    expect(plain(filesOf([defect])['sources.md'])).toContain('20 may 2016');
  });

  it('RF-603 text of the reason and the claim from the model and the repository is shown as text', () => {
    const hostile = '<img src=x onerror=alert(1)> [x](javascript:alert(1))';
    const files = filesOf([{ ...defect, reason: hostile }]);

    expect(dangerousIn(files['risks.md'])).toBeUndefined();
    expect(dangerousIn(files['open-questions.md'])).toBeUndefined();
    expect(dangerousIn(files['tasks.md'])).toBeUndefined();
  });
});

describe('the default of a security question', () => {
  const security = judged({
    ...{ claimId: 'OQ-001.c1', kind: 'defect', decisionId: undefined, security: true },
    reason: 'Nothing checks who may open the page.',
  });

  it('P5-41 an analysis question whose card holds a security defect defaults to the secure option', () => {
    const text = plain(filesOf([security])['open-questions.md']);
    const line = text.split('\n').find((each) => each.startsWith('- OQ-001:')) ?? '';

    expect(line).toContain('Default: Use the secure option');
    expect(line).not.toContain('Keep the legacy behaviour exactly');
  });

  it('P5-41 a security keep-or-fix row defaults to the secure option, not to fix alone', () => {
    const text = plain(filesOf([security])['open-questions.md']);

    expect(text).toMatch(/KF-001.*Default: Use the secure option/u);
  });

  it('RF-631 a question with no security judgement keeps the legacy default', () => {
    const text = plain(filesOf([])['open-questions.md']);
    const line = text.split('\n').find((each) => each.startsWith('- OQ-001:')) ?? '';

    expect(line).toContain('Default: Keep the legacy behaviour exactly');
  });

  it('P5-41 the rule for a default names the exception for a security question', () => {
    const text = plain(filesOf([])['open-questions.md']);

    expect(text).toContain('A default keeps the legacy behaviour');
    expect(text).toContain(
      'A security question is the exception: its default is the secure option',
    );
  });

  it('P5-41 the build method states the same exception', () => {
    const text = plain(filesOf([])['AGENTS.md']);

    expect(text).toContain('the default keeps the legacy behaviour');
    expect(text).toContain('a security question defaults to the secure option');
  });
});

describe('acceptance criteria against kept claims', () => {
  const contradicts = [{ criterion: 1, claim: 'FEAT-001.c2' }];

  it('P5-41 a criterion that contradicts a kept claim is listed in checks.md', () => {
    const checks = plain(filesOf([], {}, { contradicts })['checks.md']);

    expect(checks).toContain('## Acceptance criteria against kept claims');
    expect(checks).toContain('T-001');
    expect(checks).toContain('criterion 1');
    expect(checks).toContain('FEAT-001.c2');
    expect(checks).toContain('A signed-in user sees the home page.');
  });

  it('P5-41 a contradiction with a claim the task does not keep is not listed', () => {
    const checks = plain(
      filesOf([judged({ claimId: 'FEAT-001.c2' })], {}, { contradicts })['checks.md'],
    );

    expect(checks).not.toContain('Acceptance criteria against kept claims');
  });

  it('P5-41 a criterion position that is no criterion of the task is not listed', () => {
    const checks = plain(
      filesOf([], {}, { contradicts: [{ criterion: 9, claim: 'FEAT-001.c2' }] })['checks.md'],
    );

    expect(checks).not.toContain('Acceptance criteria against kept claims');
  });

  it('P5-41 no section when no criterion contradicts a claim', () => {
    expect(plain(filesOf([])['checks.md'])).not.toContain('against kept claims');
  });
});

describe('a package with no judgement field', () => {
  it('P5-41 keeps every claim, as before', () => {
    const files = renderHandoff(handoffOf('Plain text.'), masker);

    expect(plain(files['tasks.md'])).toContain('Behaviour to keep:');
  });
});
