import {
  areaCoverage,
  surfaceCoverage,
  type AreaCoverage,
} from '../../domain/cards/area-coverage.js';
import type { Card } from '../../domain/cards/card.js';
import { objectCoverageIn, type ObjectCoverage } from '../../domain/cards/database-objects.js';
import type { CardType } from '../../domain/cards/card-vocabulary.js';
import type { Citation } from '../../domain/cards/citation.js';
import { isIncompleteFlow } from '../../domain/cards/flow-completeness.js';
import { marksOf } from '../../domain/code-map/area-surface.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { AgentTaskRequest } from '../agent/agent-loop.js';
import type { ReaderTask } from './reader-tasks.js';

// RF-230, ADR-005: which files each reader task actually read. The read-only tools of a task are
// wrapped so the file lines of every answer the model got (a read, the lines of grep matches) are kept; when a task ends, its area's coverage is the files of
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
    readableAreaFiles: () => inner.readableAreaFiles(),
    readableAreaEntries: () => inner.readableAreaEntries(),
    renderBlock: (source, text) => inner.renderBlock(source, text),
    rowSpans: (path) => inner.rowSpans(path),
    async run(call, ids) {
      const outcome = await inner.run(call, ids);
      if (outcome.error === undefined && outcome.listed !== true) reads.add(outcome.excerpts ?? []);
      return outcome;
    },
  };
}

export interface TaskCoverageEnd {
  readonly reads: TaskReads;
  readonly failure: string | undefined;
  /** RF-263: the cards the task gave, so the coverage counts its flows and screens. */
  readonly cards?: readonly { readonly type: CardType }[];
  /** RF-206, RF-243: what the area's coverage says besides the lines read. */
  readonly note?: string | undefined;
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
  record(
    task: ReaderTask,
    codeMap: Pick<CodeMap, 'files' | 'symbols'>,
    end: TaskCoverageEnd,
  ): void {
    const coverage = areaCoverage(task.area, codeMap.files, end.reads.all());
    const failure = end.failure === undefined ? {} : { failure: end.failure };
    const marks = marksOf(task.area, codeMap);
    const surface = end.cards === undefined ? {} : { surface: surfaceCoverage(marks, end.cards) };
    const note = end.note === undefined ? {} : { note: end.note };
    this.ended.set(task.agentTaskId, { ...coverage, ...failure, ...surface, ...note });
  }

  /** RF-006: the coverage a task of the run's earlier session left, kept as it was. */
  restore(agentTaskId: string, coverage: AreaCoverage): void {
    this.ended.set(agentTaskId, coverage);
  }

  /** The coverage of one ended task. */
  of(agentTaskId: string): AreaCoverage | undefined {
    return this.ended.get(agentTaskId);
  }

  /**
   * The coverage of the ended tasks. With the cards, each area also counts its incomplete flows
   * (RF-260), which only the verifier's steps decide, so it is worked out whenever it is written.
   */
  areas(cards?: readonly Card[]): readonly AreaCoverage[] {
    return this.tasks.flatMap((task) => {
      const coverage = this.ended.get(task.agentTaskId);
      if (coverage === undefined) return [];
      if (cards === undefined || coverage.surface === undefined) return [coverage];
      const own = cards.filter((card) => card.agentTaskId === task.agentTaskId);
      const incompleteFlows = own.filter(isIncompleteFlow).length;
      return [{ ...coverage, surface: { ...coverage.surface, incompleteFlows } }];
    });
  }

  /** P5-36, RF-230: the database objects of the ended tasks' areas, with the card that states each. */
  objects(
    codeMap: Pick<CodeMap, 'files' | 'symbols'>,
    cards: readonly Card[],
  ): readonly ObjectCoverage[] {
    return objectCoverageIn(codeMap, this.areas(cards), cards);
  }
}
