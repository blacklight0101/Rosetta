// RF-648, RF-649, RF-650, RF-645, DEC-150: the three questions Plan setup asks of a project of Excel
// workbooks, with their options. The page keeps its own copy of the options of
// src/domain/planning/workbook-setup.ts (the web code imports nothing from src); a test fails when
// the two drift apart. The answers are the brief's `chosen` option id (or "typed") and `typed` text.

export const WORKBOOK_QUESTIONS = [
  { id: 'workbook.signIn', label: 'How will people sign in to the new application?' },
  { id: 'workbook.store', label: 'Where will the new application keep its secrets?' },
  { id: 'workbook.screens', label: 'Should each register get screens?' },
] as const;

export type WorkbookPageQuestion = (typeof WORKBOOK_QUESTIONS)[number]['id'];

export const WORKBOOK_IDS: readonly string[] = WORKBOOK_QUESTIONS.map((each) => each.id);

export interface WorkbookPageOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly recommended: boolean;
}

type Plain = Omit<WorkbookPageOption, 'recommended'>;

const OPTIONS: Readonly<Record<WorkbookPageQuestion, readonly Plain[]>> = {
  'workbook.signIn': [
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
      description:
        'The application keeps its own users and passwords, with the upkeep that brings.',
    },
  ],
  'workbook.store': [
    {
      id: 'platform',
      title: 'The secret store of the hosting platform',
      description:
        'Secrets live in the store the host offers and reach the application at start-up.',
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
  ],
  'workbook.screens': [
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
  ],
};

const WINDOWS_HOST = /\b(?:iis|windows|intranet)\b/iu;

/** The options of a question, the recommended one first; the sign-in follows the hosting answer. */
export function workbookOptions(
  question: WorkbookPageQuestion,
  hosting: string,
): WorkbookPageOption[] {
  const plain = OPTIONS[question];
  const recommended =
    question === 'workbook.signIn'
      ? WINDOWS_HOST.test(hosting)
        ? 'windows'
        : 'sso'
      : plain[0]?.id;
  const all = plain.map((option) => ({ ...option, recommended: option.id === recommended }));
  return [...all.filter((o) => o.recommended), ...all.filter((o) => !o.recommended)];
}
