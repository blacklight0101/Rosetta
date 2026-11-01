import { breakMarkers } from '../egress/marker-skeleton.js';
import type { BriefOption } from './brief-question-options.js';
import type { DefaultedQuestion } from './brief-questions.js';
import type { PlanningBrief } from './planning-brief.js';
import { typedText } from './typed-answers.js';

// RF-648, RF-649, RF-650, RF-645, DEC-150, DEC-178: a workbook has no sign-in, no secrets handling
// and no screens to read from code, so Plan setup asks three questions of a project of Excel
// workbooks. Each has three options, the recommended one first; a skipped question takes it. The
// answers are the brief's `chosen` option id (or `typed`) and `typed` text of the keys below; they
// are never in `defaulted`, so a brief of a repository is unchanged.

export const workbookQuestionIds = [
  'workbook.signIn',
  'workbook.store',
  'workbook.screens',
] as const;
export type WorkbookQuestionId = (typeof workbookQuestionIds)[number];

export interface WorkbookOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly recommended: boolean;
}

/** One answer: the option id (`typed` for an own answer), its words and whether it is the default. */
export interface WorkbookAnswer {
  readonly option: string;
  readonly words: string;
  readonly defaulted: boolean;
}

export interface WorkbookSetup {
  readonly signIn: WorkbookAnswer;
  readonly secrets: WorkbookAnswer;
  readonly screens: WorkbookAnswer;
}

type Plain = Omit<WorkbookOption, 'recommended'>;

const SIGN_IN: readonly Plain[] = [
  {
    id: 'windows',
    title: 'Windows authentication',
    description:
      'People sign in with their network account; no password is stored by the application.',
  },
  {
    id: 'sso',
    title: 'Single sign-on',
    description:
      "People sign in through the organisation's identity provider; no password is stored.",
  },
  {
    id: 'accounts',
    title: 'Accounts of the application',
    description: 'The application keeps its own users and passwords, with the upkeep that brings.',
  },
];

const SECRETS: readonly Plain[] = [
  {
    id: 'platform',
    title: 'The secret store of the hosting platform',
    description: 'Secrets live in the store the host offers and reach the application at start-up.',
  },
  {
    id: 'vault',
    title: 'A dedicated secrets manager',
    description: 'One vault for every application, with its own access rules and rotation.',
  },
  {
    id: 'environment',
    title: 'Environment variables set by the deployment',
    description:
      'The deployment fills them in; simple, but anyone with access to the host can read them.',
  },
];

const SCREENS: readonly Plain[] = [
  {
    id: 'full',
    title: 'List, edit and search screens',
    description:
      'Each register gets screens to list, change and search its rows, as the workbook did.',
  },
  {
    id: 'read-only',
    title: 'List and search screens only',
    description: 'Each register can be read and searched; changes stay outside the application.',
  },
  {
    id: 'none',
    title: 'No screens',
    description: 'The package plans no screen; the data is reached by other means.',
  },
];

const OPTIONS: Readonly<Record<WorkbookQuestionId, readonly Plain[]>> = {
  'workbook.signIn': SIGN_IN,
  'workbook.store': SECRETS,
  'workbook.screens': SCREENS,
};

/** The hosting answers that point to a Windows or intranet host. */
const WINDOWS_HOST = /\b(?:iis|windows|intranet)\b/iu;

/** The id the question recommends; the sign-in follows the hosting answer. */
function recommendedOf(question: WorkbookQuestionId, hosting: string): string {
  if (question === 'workbook.signIn') return WINDOWS_HOST.test(hosting) ? 'windows' : 'sso';
  return OPTIONS[question][0]?.id ?? '';
}

/** The options of a question, the recommended one first. */
// RF-648, RF-649, RF-650
export function workbookOptions(question: WorkbookQuestionId, hosting: string): WorkbookOption[] {
  const recommended = recommendedOf(question, hosting);
  const all = OPTIONS[question].map((option) => ({
    ...option,
    recommended: option.id === recommended,
  }));
  return [
    ...all.filter((option) => option.recommended),
    ...all.filter((option) => !option.recommended),
  ];
}

/** The hosting layer's answer of the brief, empty when there is none. */
function hostingOf(brief: PlanningBrief): string {
  return brief.stack.find((entry) => entry.layer === 'hosting')?.choice ?? '';
}

function answerOf(brief: PlanningBrief, question: WorkbookQuestionId): WorkbookAnswer {
  const options = workbookOptions(question, hostingOf(brief));
  const chosen = brief.chosen?.[question];
  if (chosen === 'typed') {
    const text = typedText(brief.typed?.[question]);
    if (text !== '') return { option: 'typed', words: breakMarkers(text), defaulted: false };
  }
  const picked = options.find((option) => option.id === chosen);
  if (picked !== undefined) return { option: picked.id, words: picked.title, defaulted: false };
  const [first] = options;
  return { option: first?.id ?? '', words: first?.title ?? '', defaulted: true };
}

/** The answers of a brief with every unanswered question at its default. */
// RF-648, RF-649, RF-650
export function workbookSetup(brief: PlanningBrief): WorkbookSetup {
  return {
    signIn: answerOf(brief, 'workbook.signIn'),
    secrets: answerOf(brief, 'workbook.store'),
    screens: answerOf(brief, 'workbook.screens'),
  };
}

const questionText: Readonly<Record<WorkbookQuestionId, string>> = {
  'workbook.signIn': 'How will people sign in to the new application?',
  'workbook.store': 'Where will the new application keep its secrets?',
  'workbook.screens': 'Should each register get screens?',
};

const answerOf2 = (setup: WorkbookSetup, id: WorkbookQuestionId): WorkbookAnswer =>
  id === 'workbook.signIn' ? setup.signIn : id === 'workbook.store' ? setup.secrets : setup.screens;

/** The questions that took their default, for `open-questions.md`; none for a project that is not a workbook. */
// RF-648, RF-649, RF-650
export function workbookQuestions(setup: WorkbookSetup | undefined): DefaultedQuestion[] {
  if (setup === undefined) return [];
  return workbookQuestionIds
    .filter((id) => answerOf2(setup, id).defaulted)
    .map((id) => ({
      id,
      question: questionText[id],
      answer: `${answerOf2(setup, id).words}. This is the recommended option; nobody answered.`,
    }));
}

/** The options of those questions as suggested answers (RF-637, RF-645). */
// RF-648, RF-649, RF-650
export function workbookOptionsFor(
  brief: PlanningBrief,
  setup: WorkbookSetup | undefined,
): Record<string, readonly BriefOption[]> {
  return Object.fromEntries(
    workbookQuestions(setup).map(({ id }) => [
      id,
      workbookOptions(id as WorkbookQuestionId, hostingOf(brief)).map((option) => ({
        answer: option.title,
        description: option.description,
        recommended: option.recommended,
      })),
    ]),
  );
}
