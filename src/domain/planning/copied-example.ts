import type { PlanContent } from './plan-content.js';
import type { PrdContent } from './prd-content.js';

// P3-117, EV-34: a planner that copies the worked example of its prompt writes sentences nobody
// supported with a card. The example sentences are read from the planner prompt files (the JSON
// answer shown in them, in every version that models may have learned from), and every sentence of
// the package that matches one, ignoring case, punctuation and spacing, is listed in checks.md.

/** A sentence of the package that matches an example sentence of a planner prompt. */
export interface CopiedExample {
  /** The part of the package, for example "PRD, out of scope". */
  readonly where: string;
  /** The sentence as the package holds it. */
  readonly sentence: string;
}

/** Lower case, letters and digits only, one space between words. */
export function normaliseSentence(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((each) => each.trim())
    .filter((each) => each !== '');
}

const jsonString = /"((?:[^"\\\n]|\\.)*)"/gu;

/**
 * The normalised sentences of the answer shown in one prompt: each text of its fenced JSON blocks
 * that ends with a full stop and has at least two words. Titles, names, card ids and paths do not
 * end with one, so a real title such as "Place an order" is never an example sentence.
 */
export function exampleSentencesOf(promptText: string): ReadonlySet<string> {
  const found = new Set<string>();
  for (const block of promptText.matchAll(/```json\r?\n([\s\S]*?)```/gu)) {
    for (const literal of (block[1] ?? '').matchAll(jsonString)) {
      for (const normal of normalSentencesOf(parseLiteral(literal[1] ?? ''))) found.add(normal);
    }
  }
  return found;
}

/** The normalised sentences of a text that ends with a full stop; two words at least each. */
function normalSentencesOf(text: string): string[] {
  if (!text.endsWith('.')) return [];
  return sentencesOf(text)
    .map(normaliseSentence)
    .filter((normal) => normal.split(' ').length >= 2);
}

function parseLiteral(body: string): string {
  try {
    const value: unknown = JSON.parse(`"${body}"`);
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

/** The example sentences of several prompt texts, once each. */
export function exampleSentencesOfAll(promptTexts: readonly string[]): ReadonlySet<string> {
  return new Set(promptTexts.flatMap((text) => [...exampleSentencesOf(text)]));
}

interface Text {
  readonly where: string;
  readonly text: string;
}

function prdTexts(prd: PrdContent): Text[] {
  const statement = (where: string, each: { readonly text: string } | undefined): Text[] =>
    each === undefined ? [] : [{ where, text: each.text }];
  const all = (where: string, list: readonly { readonly text: string }[]): Text[] =>
    list.flatMap((each) => statement(where, each));
  return [
    ...statement('PRD, problem', prd.problem),
    ...statement('PRD, goal', prd.goal),
    ...prd.roles.map((each) => ({ where: 'PRD, roles', text: each.description })),
    ...prd.features.map((each) => ({ where: 'PRD, features', text: each.description })),
    ...all('PRD, rules', prd.rules),
    ...all('PRD, out of scope', prd.outOfScope),
    ...all('PRD, non-functional', prd.nonFunctional),
  ];
}

function planTexts(plan: PlanContent): Text[] {
  const at = (where: string, texts: readonly string[]): Text[] =>
    texts.map((text) => ({ where, text }));
  const { technical } = plan;
  return [
    ...at('Plan, summary', [plan.summary]),
    ...at(
      'Plan, requirements',
      plan.requirements.map((each) => each.statement),
    ),
    ...plan.decisions.flatMap((each) =>
      at('Plan, decisions', [each.context, each.decision, each.consequences]),
    ),
    ...at(
      'Plan, entities',
      plan.entities.map((each) => each.notes),
    ),
    ...plan.phases.flatMap((each) => at('Plan, phases', [each.goal, ...each.exitCriteria])),
    ...plan.tasks.flatMap((each) =>
      at('Plan, task cards', [each.invariant, ...each.acceptanceCriteria, ...each.probes]),
    ),
    ...at(
      'Plan, risks',
      plan.risks.map((each) => each.text),
    ),
    ...at(
      'Plan, integrations',
      technical.integrations.map((each) => each.note),
    ),
    ...technical.security.flatMap((each) =>
      at('Plan, security', [each.description, each.invariant, each.alternative]),
    ),
    ...at(
      'Plan, targets',
      technical.targets.map((each) => each.target),
    ),
    ...at(
      'Plan, environments',
      technical.environments.map((each) => each.purpose),
    ),
  ];
}

/**
 * P3-117: the sentences of the PRD and of the plan that match an example sentence, in the order of
 * the package, each once per place. A text is checked as a whole and sentence by sentence.
 */
export function copiedExamples(
  parts: { readonly prd: PrdContent; readonly plan: PlanContent },
  examples: ReadonlySet<string>,
): CopiedExample[] {
  if (examples.size === 0) return [];
  const found: CopiedExample[] = [];
  const seen = new Set<string>();
  for (const { where, text } of [...prdTexts(parts.prd), ...planTexts(parts.plan)]) {
    for (const sentence of [text.trim(), ...sentencesOf(text)]) {
      const key = `${where}\u0000${normaliseSentence(sentence)}`;
      if (!examples.has(normaliseSentence(sentence)) || seen.has(key)) continue;
      seen.add(key);
      found.push({ where, sentence });
    }
  }
  return found;
}
