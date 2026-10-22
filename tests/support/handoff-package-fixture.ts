import type {
  HandoffPackage,
  PackagePrinciple,
} from '../../src/application/plan/handoff-package.js';
import { noApiContract } from '../../src/domain/planning/api-contract.js';
import { noUx } from '../../src/domain/planning/target-ux.js';
import { emptyPrd, prdQuestions, type PrdContent } from '../../src/domain/planning/prd-content.js';
import { assemblePlan } from '../../src/domain/planning/plan-content.js';
import type { PlanDraft } from '../../src/domain/planning/plan-draft.js';
import { noStyleFindings } from '../../src/domain/planning/style-rules.js';
import { buildBrief } from '../../src/domain/planning/planning-brief.js';
import { draftTask } from './task-card-fixtures.js';
import { targetModel } from './data-model-fixtures.js';
import { shippedCatalogue } from './planning-brief-harness.js';

// RF-601: a hand-off package whose every model and repository text is the given text.

function principle(id: string, title: string, rule: string): PackagePrinciple {
  return { id, title, rule, why: 'It matters.', check: 'Look at it.', group: undefined };
}

function draft(text: string): PlanDraft {
  return {
    summary: text,
    requirements: [{ title: text, statement: text, sources: ['FEAT-001'] }],
    components: [
      { name: text, responsibility: text, role: 'business', dependsOn: ['Store'] },
      { name: 'Store', responsibility: 'Keeps data.', role: 'data', dependsOn: [] },
    ],
    decisions: [{ title: text, context: text, decision: text, consequences: text, sources: [] }],
    entities: [{ legacy: text, target: text, notes: text, sources: ['FEAT-001'] }],
    phases: [{ name: text, goal: text, exitCriteria: [text] }],
    tasks: [
      draftTask({
        ...{ title: text, acceptanceCriteria: [`Given ${text}, when ${text}, then ${text}.`] },
        ...{ invariant: text, riskClass: 'security boundary', adds: ['parser'], probes: [text] },
      }),
    ],
    risks: [{ text, sources: ['FEAT-001'] }],
    technical: {
      integrations: [{ card: 'INT-001', action: 'replace', note: text, decision: 1 }],
      security: [
        {
          ...{ name: text, approach: 'denylist', description: text, invariant: text },
          ...{ alternative: text, sources: ['FEAT-001'], decision: 1 },
        },
      ],
      targets: [{ name: text, target: text, sources: ['FEAT-001'], decision: null }],
      environments: [{ name: text, purpose: text, decision: null }],
    },
  };
}

function briefOf(text: string): HandoffPackage['brief'] {
  const answers = {
    stack: [{ layer: 'database', choice: text, custom: true }],
    context: {
      teamSize: 2,
      experience: text,
      deadline: text,
      keepIntegrations: [text],
      dataMigration: text,
    },
    buildMethod: { aiAssisted: true },
  } as const;
  return { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
}

function sourceOf(
  id: string,
  type: 'FEAT' | 'INT',
  text: string,
): HandoffPackage['sources'][number] {
  return {
    ...{ id, type, title: text, summary: text, area: text },
    claims: [
      {
        claimId: `${id}.c1`,
        text,
        citations: [{ path: 'src/a`b.cs', startLine: 1, endLine: 2 }],
        status: 'Supported',
      },
    ],
  };
}

function sourcesOf(text: string): HandoffPackage['sources'] {
  return [sourceOf('FEAT-001', 'FEAT', text), sourceOf('INT-001', 'INT', text)];
}

/** RF-623: the target data model with this text as the purpose of a table and the reason of a dropped field. */
function dataModelOf(text: string): HandoffPackage['dataModel'] {
  const model = targetModel();
  return {
    ...model,
    tables: model.tables.map((table) => ({ ...table, purpose: text })),
    dropped: model.dropped.map((field) => ({ ...field, reason: text })),
  };
}

/** RF-625: one mapped journey and one journey out of scope, with this text in every model field. */
function flowsOf(text: string): HandoffPackage['flows'] {
  const step = { claimId: 'FLOW-001.c1', text, touches: 'FEAT-001', component: text, action: text };
  const unmapped = { ...step, claimId: 'FLOW-001.c2', touches: null, component: null, action: '' };
  return {
    flows: [
      { cardId: 'FLOW-001', title: text, trigger: text, outcome: text, steps: [step, unmapped] },
    ],
    outOfScope: [{ cardId: 'FLOW-002', title: text, reason: text, byPlanner: true }],
  };
}

/** The package with this text in every model and repository field. */
export function handoffOf(
  text: string,
  prd: PrdContent = emptyPrd,
  extra: Partial<HandoffPackage> = {},
): HandoffPackage {
  const content = assemblePlan(draft(text), new Set(['FEAT-001', 'INT-001'])).content;
  return {
    repository: { url: 'https://github.com/octo/demo', commitSha: 'c'.repeat(40) },
    sourceRun: '20261012-090000-understand',
    brief: briefOf(text),
    style: {
      ...principle('layered', 'Layered', 'Layers call down.'),
      group: 'architecture-styles',
    },
    principles: [
      { id: 'kiss', title: text, rule: text, why: text, check: text, group: 'design-principles' },
    ],
    choices: {
      style: 'ADR-001',
      migration: 'ADR-001',
      stack: [{ layer: 'database', name: text, choice: text, decision: 'ADR-001' }],
    },
    content: {
      ...content,
      decisions: content.decisions.map((decision) => ({ ...decision, options: [text] })),
    },
    restated: [],
    styleCheck: noStyleFindings,
    dataModel: dataModelOf(text),
    flows: flowsOf(text),
    apiContract: noApiContract(text),
    ux: noUx,
    incomplete: [],
    sources: sourcesOf(text),
    excluded: [{ claimId: 'FEAT-001.c2', cardId: 'FEAT-001', status: 'Rejected' }],
    briefQuestions: [{ id: 'migration', question: text, answer: text }],
    openQuestions: [{ cardId: 'OQ-001', question: text, area: text }],
    prd,
    prdQuestions: prdQuestions(prd),
    shapes: undefined,
    ...extra,
  };
}
