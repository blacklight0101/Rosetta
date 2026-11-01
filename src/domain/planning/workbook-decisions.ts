import type { PlanDecision } from './plan-content.js';
import type { WorkbookAnswer, WorkbookSetup } from './workbook-setup.js';

// RF-648, RF-649, DEC-150: the decision records of the sign-in and the secrets store of a project of
// Excel workbooks, written from the owner's answers (or the recommended options they stand for).

/** RF-648, RF-649: the record of the sign-in or of the secrets store a workbook has no code to show. */
function workbookDecision(
  answer: WorkbookAnswer,
  parts: {
    readonly id: string;
    readonly what: string;
    readonly title: string;
    readonly why: string;
  },
): PlanDecision {
  const { id, what, title, why } = parts;
  const origin = answer.defaulted
    ? ' Nobody chose, so this is the recommended option; confirm or change it.'
    : '';
  return {
    id,
    title: `${title}: ${answer.words}`,
    status: answer.defaulted ? 'Proposed' : 'Accepted',
    context: `The workbook has no ${what} to read from code, so Plan setup asked the owner. ${why}`,
    decision: `Use ${answer.words} for ${what}.${origin}`,
    consequences: `The cards that build ${what} follow this record.`,
    options: [],
    sources: [],
  };
}

export function workbookDecisions(
  setup: WorkbookSetup | undefined,
  nextId: () => string,
): PlanDecision[] {
  if (setup === undefined) return [];
  return [
    workbookDecision(setup.signIn, {
      ...{ id: nextId(), what: 'sign-in', title: 'Sign-in' },
      why: 'Who may use the application decides every screen and every card that guards one.',
    }),
    workbookDecision(setup.secrets, {
      ...{ id: nextId(), what: 'secrets handling', title: 'Secrets store' },
      why: 'The secrets found in the workbooks need one named place to live.',
    }),
  ];
}

/** The ids of the sign-in and secrets records, for the choices of the package. */
export function accessChoices(access: readonly PlanDecision[]): {
  signIn?: string;
  secrets?: string;
} {
  const [signIn, secrets] = access;
  return {
    ...(signIn === undefined ? {} : { signIn: signIn.id }),
    ...(secrets === undefined ? {} : { secrets: secrets.id }),
  };
}
