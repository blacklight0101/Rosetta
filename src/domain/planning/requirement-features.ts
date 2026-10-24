import { planId, type PlanContent, type PlanTask } from './plan-content.js';
import { isMigrationCard, type CoverageDocuments } from './plan-coverage.js';

// RF-627, DEC-160, P5-40: a task card gains the features of the requirements it lists, the way it
// gains the requirements behind what it builds (requirement-alignment.ts). A feature of the PRD
// and a requirement are both written from source cards; when a requirement the card lists cites a
// source card of a feature, the card builds that feature, even when the planner left its id out of
// `builds`. Like the alignment, it changes nothing for a card that builds nothing, and the card that
// writes the migrations is left alone: its requirements come from the tables it creates, so they
// say nothing about the features.

/** The source cards behind each feature id, in the order of the PRD. */
function featureSources(documents: CoverageDocuments): [string, ReadonlySet<string>][] {
  return documents.prd.features.map((feature, index) => [
    `feature:${planId('F', index + 1)}`,
    new Set(feature.sources),
  ]);
}

function gains(
  task: PlanTask,
  content: PlanContent,
  features: readonly [string, ReadonlySet<string>][],
): PlanTask {
  if (task.builds.length === 0 || isMigrationCard(task)) return task;
  const cited = new Set(
    content.requirements
      .filter((requirement) => task.requirements.includes(requirement.id))
      .flatMap((requirement) => requirement.sources),
  );
  const own = new Set(task.builds);
  const added = features
    .filter(([id, sources]) => !own.has(id) && [...sources].some((card) => cited.has(card)))
    .map(([id]) => id);
  if (added.length === 0) return task;
  const all = new Set([...task.builds, ...added]);
  const ordered = features.map(([id]) => id).filter((id) => all.has(id));
  return { ...task, builds: [...ordered, ...task.builds.filter((id) => !ordered.includes(id))] };
}

/** The plan with each card that builds something gaining the features its requirements lead to. */
// RF-627
export function withRequirementFeatures(
  content: PlanContent,
  documents: CoverageDocuments,
): PlanContent {
  const features = featureSources(documents);
  const tasks = content.tasks.map((task) => gains(task, content, features));
  return tasks.some((task, at) => task !== content.tasks[at]) ? { ...content, tasks } : content;
}
