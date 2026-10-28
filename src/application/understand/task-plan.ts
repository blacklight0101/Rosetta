import type { Area } from '../../domain/code-map/area.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import { thirdPartyAreaNames } from '../../domain/code-map/third-party.js';
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
// them), and no task at all when no question is left to answer: never every area. A Deepen plans its
// tasks round by round, but its plan holds every answered question of the project (RF-209, DEC-179).

export interface TaskPlan {
  readonly tasks: readonly ReaderTask[];
  /** The re-run with answers: what it compares with and marks. */
  readonly rerun?: Rerun;
}

export async function planTasks(input: {
  readonly areas: readonly Area[];
  /** P3-123: its third-party areas are read after own code, and not by default. */
  readonly scanned?: { readonly codeMap: CodeMap };
  readonly options: UnderstandOptions;
  readonly project: ProjectRef;
  readonly rerun: RerunDependencies;
}): Promise<Result<TaskPlan, UnknownAreas>> {
  const { areas, options, project } = input;
  const library = input.scanned ? thirdPartyAreaNames(input.scanned.codeMap) : new Set<string>();
  const tasks = planReaderTasks(areas, options.areas, library);
  if (tasks.ok && options.deepen !== undefined) {
    // RF-209, DEC-179: an answer is given again to the readers of its area, however often it was used.
    const names = areas.map((area) => area.name);
    const plan = await planRerun(input.rerun, project, names, { includeAnswered: true });
    return ok({ tasks: tasks.value, rerun: { deps: input.rerun, plan } });
  }
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
  const planned = wanted.length === 0 ? undefined : planReaderTasks(areas, wanted, library);
  const list = planned?.ok === true ? planned.value : [];
  return ok({ tasks: withAnswersOf(list, chosen), rerun: { deps: input.rerun, plan: chosen } });
}
