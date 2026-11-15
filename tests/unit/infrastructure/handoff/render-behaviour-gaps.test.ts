import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { PlanTask } from '../../../../src/domain/planning/plan-content.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P10-14, P10-D6, RF-631: "Plan coverage" in checks.md never reads as if all the behaviour of the
// source were built while some behaviour is kept by no card or a feature card reaches no requirement.

const masker = new SecretMasker();
const migrationTitle = 'Write the database migrations in the chosen stack';

function card(id: string, claims: readonly string[]): SourceCard {
  return {
    ...{ id, type: 'FEAT', title: `Title ${id}`, summary: 'Summary.', area: 'catalog' },
    claims: claims.map((text, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text,
      citations: [{ path: `src/${id}.cs`, startLine: 1, endLine: 2 }],
      status: 'Supported' as const,
    })),
  };
}

function packageOf(tasks: readonly PlanTask[], sources: readonly SourceCard[]): HandoffPackage {
  const base = handoffOf('Plain text.');
  const first = base.content.requirements[0];
  if (first === undefined) throw new Error('The fixture has a requirement.');
  const requirements = [{ ...first, id: 'REQ-001', sources: ['FEAT-001'] }];
  return { ...base, sources: [...sources], content: { ...base.content, tasks, requirements } };
}

function coverageOf(handoff: HandoffPackage): string[] {
  const checks = (renderHandoff(handoff, masker)['checks.md'] ?? '').replaceAll('\\', '');
  const section = (checks.split('## Plan coverage')[1] ?? '').split('\n## ')[0] ?? '';
  return section.split('\n').filter((line) => line.trim() !== '');
}

const cited = card('FEAT-001', ['The list shows ten items a page.', 'The price has two decimals.']);
const uncited = card('FEAT-007', ['Exports to a spreadsheet.']);

describe('checks.md: behaviour gaps under the plan coverage (P10-14)', () => {
  it('RF-631 says how many behaviours of how many cards are kept by no card and how many feature cards reach no requirement', () => {
    const tasks = [planTask({ id: 'T-001', title: migrationTitle, requirements: ['REQ-001'] })];

    const lines = coverageOf(packageOf(tasks, [cited, uncited]));

    expect(lines[2]).toBe(
      'Not every behaviour of the source is kept: 2 behaviours of 1 source card are kept by no card, and 1 feature card reaches no requirement (see "Behaviour kept by no card" and "Source cards that reach no requirement").',
    );
  });

  it('RF-631 names only the gap that exists', () => {
    const tasks = [planTask({ id: 'T-001', title: migrationTitle, requirements: ['REQ-001'] })];

    const lines = coverageOf(packageOf(tasks, [cited]));

    expect(lines[2]).toBe(
      'Not every behaviour of the source is kept: 2 behaviours of 1 source card are kept by no card (see "Behaviour kept by no card").',
    );
  });

  it('RF-631 writes no line when every cited behaviour is kept and every feature card reaches a requirement', () => {
    const tasks = [planTask({ id: 'T-002', requirements: ['REQ-001'] })];

    const lines = coverageOf(packageOf(tasks, [cited]));

    expect(lines.join('\n')).not.toContain('Not every behaviour');
  });
});
