import { areaCoverage, type AreaCoverage } from '../../domain/cards/area-coverage.js';
import type { Citation } from '../../domain/cards/citation.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { AgentTaskRequest } from '../agent/agent-loop.js';
import type { ReaderTask } from './reader-tasks.js';

// RF-230, ADR-005: which files each reader task actually read. The read-only tools of a task are
// wrapped so the file lines of every answer the model got (a read, the lines of grep matches, the
// statements of a code map entry) are kept; when a task ends, its area's coverage is the files of
// the area with those lines. Lines of files outside the area are not counted.

type AgentTools = AgentTaskRequest['tools'];

/** The file lines one task's tools returned, in call order. */
export class TaskReads {
  private readonly lines: Citation[] = [];

  add(excerpts: readonly Citation[]): void {
    this.lines.push(...excerpts);
  }

  all(): readonly Citation[] {
    return this.lines;
  }
}

// RF-230
export function toolsWithReads(inner: AgentTools, reads: TaskReads): AgentTools {
  return {
    definitions: inner.definitions,
    areaOverview: () => inner.areaOverview(),
    renderBlock: (source, text) => inner.renderBlock(source, text),
    async run(call, ids) {
      const outcome = await inner.run(call, ids);
      if (outcome.error === undefined) reads.add(outcome.excerpts ?? []);
      return outcome;
    },
  };
}

export interface TaskCoverageEnd {
  readonly reads: TaskReads;
  readonly failure: string | undefined;
}

/** The coverage of the ended tasks of a run, in area order (never in the order they ended). */
export class RunCoverage {
  private readonly tasks: readonly ReaderTask[];
  private readonly ended = new Map<string, AreaCoverage>();

  constructor(tasks: readonly ReaderTask[]) {
    this.tasks = tasks;
  }

  /** RF-230, RF-208: `failure` says why an area gave no usable card; undefined when it did. */
  // RF-230
  record(task: ReaderTask, codeMap: Pick<CodeMap, 'files'>, end: TaskCoverageEnd): void {
    const coverage = areaCoverage(task.area, codeMap.files, end.reads.all());
    this.ended.set(
      task.agentTaskId,
      end.failure === undefined ? coverage : { ...coverage, failure: end.failure },
    );
  }

  /** RF-006: the coverage a task of the run's earlier session left, kept as it was. */
  restore(agentTaskId: string, coverage: AreaCoverage): void {
    this.ended.set(agentTaskId, coverage);
  }

  /** The coverage of one ended task. */
  of(agentTaskId: string): AreaCoverage | undefined {
    return this.ended.get(agentTaskId);
  }

  areas(): readonly AreaCoverage[] {
    return this.tasks.flatMap((task) => {
      const coverage = this.ended.get(task.agentTaskId);
      return coverage === undefined ? [] : [coverage];
    });
  }
}
