import type { BriefAnswers } from '../../api/plan.js';
import type { Brief, StackChoice } from '../../api/plan-schemas.js';
import {
  agentToolNamedIn,
  buildMethodOf,
  MAX_NAME,
  methodDraftOf,
  MODEL_SLOTS,
  type MethodDraft,
} from './build-method.js';
import { ownAnswersOf, ownIsEmpty, ownText, TEXT_QUESTIONS, TYPED } from './own-answers.js';
import { CONTEXT_FIELDS, STACK_LAYERS, STEP_IDS, questionsOf, type ContextField } from './steps.js';

// RF-605, RF-611, DEC-80, data-model.md section 3.20: the answers on the page before they are saved.
// A draft holds what the page shows for every question, and which questions the person answered; a
// question never answered shows its default and is not sent, so the server lists it in `defaulted`
// and the package reports it as an open question. A text field is kept as typed.

export const MAX_TEXT = 500;
export const MAX_CHOICE = 200;
const MAX_INTEGRATIONS = 20;
const MAX_TEAM = 10_000;

/**
 * P6-26 (RF-611, DEC-189): the answer to "Will the new application be hosted?". Empty is not asked
 * yet; "not-stated" is chosen on purpose. Neither sends a key, and the question is never defaulted.
 */
export type HostedAnswer = '' | 'hosted' | 'not-hosted' | 'not-stated';

type ContextText = Readonly<Record<ContextField, string>>;

export interface Draft extends MethodDraft {
  readonly principles: readonly string[];
  readonly style: string;
  readonly recommended: readonly string[];
  readonly evidence: readonly string[];
  readonly migration: string;
  /** The picked technology by layer id; a layer with no entry is unanswered. */
  readonly stack: Readonly<Record<string, StackChoice>>;
  readonly context: ContextText;
  /** P6-26: the hosted question; it writes `context.deployment` for hosted or not hosted only. */
  readonly deployment: HostedAnswer;
  /** RF-612 (Q-B): a brief saved earlier never answered the build method, so the page asks again. */
  readonly askedBefore: boolean;
  /** The ids of the questions the person answered (the ones the brief does not list as defaulted). */
  readonly answered: readonly string[];
  /** RF-645: the option that answered each question, or "typed". */
  readonly chosen: Readonly<Record<string, string>>;
  /** RF-645: the typed text of a question that keeps it apart (principles, architecture, migration, build method). */
  readonly typed: Readonly<Record<string, string>>;
  /**
   * DEC-184: the text questions with a typed answer that the saved brief still lists as defaulted (a
   * brief saved before P6-21). The planner does not read that text until the brief is saved again.
   */
  readonly typedDefaulted: readonly string[];
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
    deployment: context.deployment ?? '',
    ...methodDraftOf(brief.buildMethod, brief.defaulted),
    askedBefore: brief.savedAt !== null && brief.defaulted.includes('buildMethod'),
    answered: QUESTION_IDS.filter((id) => !brief.defaulted.includes(id)),
    chosen: brief.chosen ?? {},
    typed: brief.typed ?? {},
    typedDefaulted: TEXT_QUESTIONS.filter(
      (id) =>
        brief.defaulted.includes(id) && ownText(brief.chosen ?? {}, brief.typed ?? {}, id) !== '',
    ),
  };
}

/** DEC-184: the draft once saved; every typed answer it holds was sent, so none stays defaulted. */
export function savedDraft(draft: Draft): Draft {
  return draft.typedDefaulted.length === 0 ? draft : { ...draft, typedDefaulted: [] };
}

/**
 * RF-612 (Q-A): while the build method is unanswered and the project context names an agent tool,
 * the step shows agents and that tool selected. The person's own answer always wins.
 */
export function shownMethod(draft: Draft): Draft {
  const named = agentToolNamedIn(draft.context);
  if (draft.answered.includes('buildMethod') || named === undefined) return draft;
  return {
    ...draft,
    aiAssisted: true,
    toolKind: draft.toolKind === '' ? named.kind : draft.toolKind,
    toolName: draft.toolName === '' ? (named.name ?? '') : draft.toolName,
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

/** RF-609, Q-59: no stack layer has a choice, so the package names no technology. */
export function noStackChosen(draft: Draft): boolean {
  return stackOf(draft).length === 0;
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
  const hosted = draft.deployment === 'hosted' || draft.deployment === 'not-hosted';
  // A question answered by typing sends its text instead of an option, and not its field: the server
  // keeps the default value and the text reaches the planner (DEC-184); an empty text sends nothing.
  const plain = (id: string): boolean => answered(id) && draft.chosen[id] !== TYPED;
  const sends = (id: string): boolean => {
    if (TEXT_QUESTIONS.some((each) => each === id)) {
      if (draft.chosen[id] === TYPED) return !ownIsEmpty(draft.chosen, draft.typed, id);
      return answered(id);
    }
    if (id.startsWith('stack.')) return stack.some((entry) => `stack.${entry.layer}` === id);
    return answered(id);
  };
  return {
    ...(answered('principles') ? { principles: draft.principles } : {}),
    ...(plain('architecture')
      ? {
          architecture: {
            style: draft.style,
            recommended: draft.recommended,
            evidence: draft.evidence,
          },
        }
      : {}),
    ...(plain('migration') ? { migration: draft.migration } : {}),
    ...(stack.length === 0 ? {} : { stack }),
    ...(asked.length === 0 && !hosted
      ? {}
      : {
          context: {
            ...Object.fromEntries(asked.map((field) => [field, context[field]])),
            ...(hosted ? { deployment: draft.deployment } : {}),
          },
        }),
    ...(plain('buildMethod') ? { buildMethod: buildMethodOf(draft) } : {}),
    ...ownAnswersOf(draft, sends),
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

function typedProblems(draft: Draft): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [id, text] of Object.entries(draft.typed)) {
    if (text.trim().length > MAX_TEXT)
      found[`typed.${id}`] = `Use at most ${String(MAX_TEXT)} characters.`;
  }
  return found;
}

function methodProblems(draft: Draft): Record<string, string> {
  const found: Record<string, string> = {};
  const message = `Use at most ${String(MAX_NAME)} characters.`;
  for (const slot of MODEL_SLOTS) {
    if (draft.models[slot].trim().length > MAX_NAME) found[`buildMethod.models.${slot}`] = message;
  }
  if (draft.toolName.trim().length > MAX_NAME) found['buildMethod.agentTool'] = message;
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
  Object.assign(found, typedProblems(draft), methodProblems(draft));
  return found;
}
