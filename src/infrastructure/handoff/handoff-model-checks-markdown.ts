import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import {
  isLocalTier,
  modelForTier,
  resolveBuildMethod,
} from '../../domain/planning/build-method.js';
import {
  checkCardModel,
  type ModelFinding,
  type ModelFindingKind,
} from '../../domain/planning/card-model-check.js';
import type { PlanTask } from '../../domain/planning/plan-content.js';
import { difficultyOfTask } from '../../domain/planning/task-method.js';
import { riskLines } from './handoff-quality-markdown.js';

// RF-641, RF-639, DEC-176 Q-D and Q-F: checks.md lists, for a build by agents, each task card whose
// model, tier, risk class or verifier is wrong, with the card id, and corrects nothing. The card's
// model comes from the brief and its tier from the table in code, so the check reads what the card
// line says; a package with no such card has no section. The sentences are Rosetta's.

const reasons: Readonly<Record<ModelFindingKind, string>> = {
  'tier-unnamed': 'no model is named for its tier, so the card shows the tier alone',
  'model-not-in-brief': 'its model is not one of the models of the chosen tool',
  'tier-below-band': 'its tier is lower than the tier of its difficulty band',
  'risk-tier-below-middle': 'its risk class needs at least the middle tier',
  'risk-verifier-below-largest': 'its risk class needs the largest tier as verifier',
  'verifier-below-builder': 'its verifier is of a lower tier than its builder',
  'risk-not-shown': 'its risk class is not shown next to its difficulty',
  'escalation-owner-approval': 'uses the escalation model, which needs the owner approval',
  'local-model': 'a local model builds only cards of difficulty 1 and 2 (scripted work)',
};

function findingsOf(task: PlanTask, handoff: HandoffPackage): ModelFinding[] {
  const method = resolveBuildMethod(handoff.brief.buildMethod);
  const { rating, tier, verifier } = difficultyOfTask(task, method);
  return checkCardModel(method, {
    ...{ cardId: task.id, rating, riskClass: task.riskClass },
    riskShown: riskLines(task)[0]?.includes(task.riskClass) === true,
    ...{ builderTier: tier, builderModel: modelForTier(method, tier) },
    ...{ verifierTier: verifier, verifierModel: modelForTier(method, verifier) },
    local: isLocalTier(method, tier),
    status: undefined,
  });
}

// RF-641
export function modelCheckLines(handoff: HandoffPackage): string[] {
  if (!handoff.brief.buildMethod.aiAssisted) return [];
  const found = handoff.content.tasks.flatMap((task) => findingsOf(task, handoff));
  if (found.length === 0) return [];
  return [
    '## Model of each card',
    '',
    'The check lists each task card below by its id and corrects nothing; the package is written either way. A warning is not a fault of the package, but the card should be read again.',
    '',
    ...found.map(
      (each) =>
        `- ${each.cardId}${each.severity === 'warning' ? ' (warning)' : ''}: ${reasons[each.kind]}`,
    ),
    '',
  ];
}
