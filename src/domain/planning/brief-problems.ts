import type { Catalogue } from './catalogue.js';
import type { BriefAnswers } from './planning-brief.js';
import { hasTypedText, typedQuestionIds } from './typed-answers.js';
import { workbookQuestionIds } from './workbook-setup.js';

// P7-18: the problems of a save, split out of planning-brief.ts (behaviour unchanged).

export interface BriefProblem {
  readonly field: string;
  readonly reason: string;
}

function isPrinciple(catalogue: Catalogue, id: string): boolean {
  return catalogue.entries.some(
    (entry) => entry.id === id && entry.group !== 'architecture-styles',
  );
}

/** What is wrong with the answers of a save: an unknown principle, a repeated layer or entry, a typed build method with agents. */
// RF-605
export function briefProblems(answers: BriefAnswers, catalogue: Catalogue): BriefProblem[] {
  const problems: BriefProblem[] = [];
  const principles = answers.principles ?? [];
  principles.forEach((id, index) => {
    if (!isPrinciple(catalogue, id)) {
      problems.push({ field: `principles.${String(index)}`, reason: `${id} is not a principle.` });
    }
  });
  if (new Set(principles).size !== principles.length) {
    problems.push({ field: 'principles', reason: 'A principle is listed twice.' });
  }
  const layers = (answers.stack ?? []).map((entry) => entry.layer);
  if (new Set(layers).size !== layers.length) {
    problems.push({ field: 'stack', reason: 'A layer is listed twice.' });
  }
  for (const id of Object.keys(answers.typed ?? {})) {
    if (![...typedQuestionIds, ...workbookQuestionIds].some((each) => each === id)) {
      problems.push({ field: `typed.${id}`, reason: 'This question takes no typed text.' });
    }
  }
  return [...problems, ...typedBuildMethodProblems(answers)];
}

// DEC-187 (4): a typed build method is not an agent build; Rosetta does not read free text as a choice.
function typedBuildMethodProblems(answers: BriefAnswers): BriefProblem[] {
  return answers.buildMethod?.aiAssisted === true && hasTypedText(answers.typed, 'buildMethod')
    ? [{ field: 'typed.buildMethod', reason: 'A typed build method cannot be saved with agents.' }]
    : [];
}
