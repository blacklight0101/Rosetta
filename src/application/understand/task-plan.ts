import type { Area } from '../../domain/code-map/area.js';
import { ok, type Result } from '../../domain/errors/result.js';
import type { ProjectRef } from '../ports/answers-file.js';
import {
  areasToRun,
  onlyAreas,
  planRerun,
  withAnswersOf,
  type Rerun,
  type RerunDependencies,
} from './answer-rerun.js';
import { planReaderTasks, type ReaderTask, type UnknownAreas } from './reader-tasks.js';
import type { UnderstandOptions } from './understand-options.js';

// RF-200, RF-241: the reader tasks of an understand run. Without the answers option, one task per
// area or per named area. With it, only the areas of the answered questions (the named ones among
// them), and no task at all when no question is left to answer: never every area.

export interface TaskPlan {
  readonly tasks: readonly ReaderTask[];
  /** The re-run with answers: what it compares with and marks. */
  readonly rerun?: Rerun;
}

export async function planTasks(input: {
  readonly areas: readonly Area[];
  readonly options: UnderstandOptions;
  readonly project: ProjectRef;
  readonly rerun: RerunDependencies;
}): Promise<Result<TaskPlan, UnknownAreas>> {
  const { areas, options, project } = input;
  const tasks = planReaderTasks(areas, options.areas);
  if (!tasks.ok || options.withAnswers !== true) {
    return tasks.ok ? ok({ tasks: tasks.value }) : tasks;
  }
  const plan = await planRerun(
    input.rerun,
    project,
    areas.map((area) => area.name),
  );
  const wanted = areasToRun(plan, options.areas);
  const chosen = onlyAreas(plan, wanted);
  const planned = wanted.length === 0 ? undefined : planReaderTasks(areas, wanted);
  const list = planned?.ok === true ? planned.value : [];
  return ok({ tasks: withAnswersOf(list, chosen), rerun: { deps: input.rerun, plan: chosen } });
}
