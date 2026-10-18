import type { BriefAnswers } from '../../api/plan.js';
import type { Brief, StackChoice } from '../../api/plan-schemas.js';
import { CONTEXT_FIELDS, STACK_LAYERS, STEP_IDS, questionsOf, type ContextField } from './steps.js';

// RF-605, RF-611, DEC-80, data-model.md section 3.20: the answers on the page before they are saved.
// A draft holds what the page shows for every question, and which questions the person answered; a
// question never answered shows its default and is not sent, so the server lists it in `defaulted`
// and the package reports it as an open question. A text field is kept as typed.

export const MAX_TEXT = 500;
export const MAX_CHOICE = 200;
export const MAX_INTEGRATIONS = 20;
export const MAX_TEAM = 10_000;

export type ContextText = Readonly<Record<ContextField, string>>;

export interface Draft {
  readonly principles: readonly string[];
  readonly style: string;
  readonly recommended: readonly string[];
  readonly evidence: readonly string[];
  readonly migration: string;
  /** The picked technology by layer id; a layer with no entry is unanswered. */
  readonly stack: Readonly<Record<string, StackChoice>>;
  readonly context: ContextText;
  readonly aiAssisted: boolean;
  /** The ids of the questions the person answered (the ones the brief does not list as defaulted). */
  readonly answered: readonly string[];
}

/** Every question id of the brief, in question order (data-model.md section 3.20). */
const QUESTION_IDS: readonly string[] = STEP_IDS.flatMap((step) => questionsOf(step));

const textOf = (value: string | null): string => value ?? '';

// RF-605
export function draftOf(brief: Brief): Draft {
  const { context } = brief;
  return {
    principles: brief.principles,
    style: brief.architecture.style,
    recommended: brief.architecture.recommended,
    evidence: brief.architecture.evidence,
    migration: brief.migration,
    stack: Object.fromEntries(brief.stack.map((entry) => [entry.layer, entry])),
    context: {
      teamSize: context.teamSize === null ? '' : String(context.teamSize),
      experience: textOf(context.experience),
      deadline: textOf(context.deadline),
      keepIntegrations: context.keepIntegrations.join('\n'),
      dataMigration: textOf(context.dataMigration),
    },
    aiAssisted: brief.buildMethod.aiAssisted,
    answered: QUESTION_IDS.filter((id) => !brief.defaulted.includes(id)),
  };
}

export function isAnswered(draft: Draft, id: string): boolean {
  return draft.answered.includes(id);
}

/** The draft with these questions recorded as answered. */
export function withAnswered(draft: Draft, ids: readonly string[]): Draft {
  return { ...draft, answered: [...new Set([...draft.answered, ...ids])] };
}

/** The picked layers in layer order: a layer is answered by having a choice. */
function stackOf(draft: Draft): StackChoice[] {
  return STACK_LAYERS.map((layer) => draft.stack[layer.id]).filter(
    (entry): entry is StackChoice => entry !== undefined && entry.choice.trim() !== '',
  );
}

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

function contextOf(context: ContextText): NonNullable<BriefAnswers['context']> {
  const text = (value: string): string | null => (value.trim() === '' ? null : value.trim());
  const members = context.teamSize.trim();
  return {
    teamSize: members === '' ? null : Number(members),
    experience: text(context.experience),
    deadline: text(context.deadline),
    keepIntegrations: lines(context.keepIntegrations),
    dataMigration: text(context.dataMigration),
  };
}

/** The body of a save: only the parts the person answered (a part left out takes its default). */
// RF-605
export function answersOf(draft: Draft): BriefAnswers {
  const answered = (id: string): boolean => isAnswered(draft, id);
  const stack = stackOf(draft);
  const asked = CONTEXT_FIELDS.filter((field) => answered(`context.${field}`));
  const context = contextOf(draft.context);
  return {
    ...(answered('principles') ? { principles: draft.principles } : {}),
    ...(answered('architecture')
      ? {
          architecture: {
            style: draft.style,
            recommended: draft.recommended,
            evidence: draft.evidence,
          },
        }
      : {}),
    ...(answered('migration') ? { migration: draft.migration } : {}),
    ...(stack.length === 0 ? {} : { stack }),
    ...(asked.length === 0
      ? {}
      : { context: Object.fromEntries(asked.map((field) => [field, context[field]])) }),
    ...(answered('buildMethod') ? { buildMethod: { aiAssisted: draft.aiAssisted } } : {}),
  };
}

const WHOLE = /^\d+$/u;

function longTexts(context: ContextText): Record<string, string> {
  const found: Record<string, string> = {};
  for (const field of ['experience', 'deadline', 'dataMigration'] as const) {
    if (context[field].trim().length > MAX_TEXT) {
      found[`context.${field}`] = `Use at most ${String(MAX_TEXT)} characters.`;
    }
  }
  return found;
}

/** What is wrong with the draft, by question id, in words; empty when it can be saved (RF-611). */
// RF-611
export function problemsOf(draft: Draft): Readonly<Record<string, string>> {
  const found: Record<string, string> = {};
  const { context } = draft;
  const team = context.teamSize.trim();
  if (team !== '' && (!WHOLE.test(team) || Number(team) < 1 || Number(team) > MAX_TEAM)) {
    found['context.teamSize'] = `Use a whole number from 1 to ${String(MAX_TEAM)}.`;
  }
  Object.assign(found, longTexts(context));
  const integrations = lines(context.keepIntegrations);
  if (
    integrations.length > MAX_INTEGRATIONS ||
    integrations.some((line) => line.length > MAX_TEXT)
  ) {
    found['context.keepIntegrations'] =
      `Use at most ${String(MAX_INTEGRATIONS)} lines of ${String(MAX_TEXT)} characters.`;
  }
  for (const [layer, entry] of Object.entries(draft.stack)) {
    if (entry.choice.trim().length > MAX_CHOICE) {
      found[`stack.${layer}`] = `Use at most ${String(MAX_CHOICE)} characters.`;
    }
  }
  return found;
}
