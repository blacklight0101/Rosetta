import type { HandoffPackage } from '../../src/application/plan/handoff-package.js';
import { assemblePlan } from '../../src/domain/planning/plan-content.js';
import type { PlanDraft } from '../../src/domain/planning/plan-draft.js';
import { buildBrief } from '../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from './planning-brief-harness.js';

// RF-601: a hand-off package whose every model and repository text is the given text.

function draft(text: string): PlanDraft {
  return {
    summary: text,
    requirements: [{ title: text, statement: text, sources: ['FEAT-001'] }],
    components: [
      { name: text, responsibility: text, dependsOn: ['Store'] },
      { name: 'Store', responsibility: 'Keeps data.', dependsOn: [] },
    ],
    decisions: [{ title: text, context: text, decision: text, consequences: text, sources: [] }],
    entities: [{ legacy: text, target: text, notes: text, sources: ['FEAT-001'] }],
    phases: [{ name: text, goal: text, exitCriteria: [text] }],
    tasks: [{ title: text, phase: 1, requirements: [1], acceptanceCriteria: [text] }],
    risks: [{ text, sources: ['FEAT-001'] }],
  };
}

/** The package with this text in every model and repository field. */
export function handoffOf(text: string): HandoffPackage {
  const brief = { ...buildBrief({}, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
  return {
    repository: { url: 'https://github.com/octo/demo', commitSha: 'c'.repeat(40) },
    sourceRun: '20261012-090000-understand',
    brief,
    style: { id: 'layered', title: 'Layered', rule: 'Layers call down.' },
    principles: [{ id: 'kiss', title: text, rule: text }],
    content: assemblePlan(draft(text), new Set(['FEAT-001'])).content,
    sources: [
      {
        ...{ id: 'FEAT-001', type: 'FEAT', title: text, summary: text, area: text },
        claims: [
          {
            claimId: 'FEAT-001.c1',
            text,
            citations: [{ path: 'src/a`b.cs', startLine: 1, endLine: 2 }],
            status: 'Supported',
          },
        ],
      },
    ],
    excluded: [{ claimId: 'FEAT-001.c2', cardId: 'FEAT-001', status: 'Rejected' }],
    briefQuestions: [{ id: 'migration', question: text, answer: text }],
    openQuestions: [{ cardId: 'OQ-001', question: text }],
  };
}
