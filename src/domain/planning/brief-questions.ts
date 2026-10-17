import type { Catalogue } from './catalogue.js';
import type { PlanningBrief } from './planning-brief.js';

// RF-604, DEC-80, data-model.md section 3.20: the questions of the planning brief that took their
// default, each with the question asked and the default the package was written with, so the
// package lists them as open questions instead of presenting the default as a decision. The
// question ids are the ones `defaulted` holds; an id this list does not know is still listed, with
// the id as its question.

export interface DefaultedQuestion {
  /** The id in `defaulted`, for example `migration` or `stack.database`. */
  readonly id: string;
  readonly question: string;
  /** The value the package used, in words. */
  readonly answer: string;
}

const layerNames: Readonly<Record<string, string>> = {
  'language-runtime': 'language and runtime',
  'backend-framework': 'back-end framework',
  'front-end': 'front end',
  database: 'database',
  'data-access': 'data access',
  testing: 'testing',
  hosting: 'hosting',
};

const migrationNames: Readonly<Record<PlanningBrief['migration'], string>> = {
  'strangler-fig': 'Strangler Fig: replace the legacy system one part at a time',
  'parallel-change': 'Parallel Change: run the old and the new side by side, then switch',
  rewrite: 'a full rewrite',
};

const contextQuestions: Readonly<Record<string, string>> = {
  teamSize: 'How many people will build the new system?',
  experience: 'What experience does the team have with the target stack?',
  deadline: 'Is there a deadline?',
  keepIntegrations: 'Which integrations must stay as they are?',
  dataMigration: 'How will the data move to the new system?',
};

const notStated = 'Not stated; the roadmap assumes nothing about it.';

function titleOf(catalogue: Catalogue, id: string): string {
  return catalogue.entries.find((entry) => entry.id === id)?.title ?? id;
}

function principlesAnswer(brief: PlanningBrief, catalogue: Catalogue): string {
  const titles = brief.principles.map((id) => titleOf(catalogue, id));
  return titles.length === 0 ? 'None.' : `The catalogue defaults: ${titles.join(', ')}.`;
}

function stackQuestion(layer: string): DefaultedQuestion {
  const name = layerNames[layer] ?? layer;
  return {
    id: `stack.${layer}`,
    question: `Which technology should the ${name} layer use?`,
    answer: 'None chosen; the package names no technology for this layer.',
  };
}

function contextQuestion(id: string, field: string): DefaultedQuestion {
  return { id, question: contextQuestions[field] ?? id, answer: notStated };
}

function questionOf(id: string, brief: PlanningBrief, catalogue: Catalogue): DefaultedQuestion {
  if (id.startsWith('stack.')) return stackQuestion(id.slice('stack.'.length));
  if (id.startsWith('context.')) return contextQuestion(id, id.slice('context.'.length));
  switch (id) {
    case 'principles':
      return {
        id,
        question: 'Which principles and practices should the build follow?',
        answer: principlesAnswer(brief, catalogue),
      };
    case 'architecture':
      return {
        id,
        question: 'Which architecture style should the new system follow?',
        answer: titleOf(catalogue, brief.architecture.style),
      };
    case 'migration':
      return {
        id,
        question: 'How should the team move from the legacy system to the new one?',
        answer: migrationNames[brief.migration],
      };
    case 'buildMethod':
      return {
        id,
        question: 'Will the team build the new system with AI agents?',
        answer: 'No; the package has no AI-assisted build method.',
      };
    default:
      return { id, question: id, answer: notStated };
  }
}

/** The questions the brief left at their default, in the brief's question order. */
// RF-604
export function defaultedQuestions(
  brief: PlanningBrief,
  catalogue: Catalogue,
): DefaultedQuestion[] {
  return brief.defaulted.map((id) => questionOf(id, brief, catalogue));
}
