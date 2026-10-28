import { at, POSITION } from './dependency-grid.js';
import type { Project } from './dependency-project.js';
import type { RefBox } from './reference-box.js';
import type { RefStore } from './dependency-store.js';
import { drive } from './render-steps.js';

const ROOTS_PER_TURN = 4096;

// RF-153: circular references. The formula cells are the nodes; a formula has an edge to each formula
// cell inside a box it reads. Strongly connected components are found with Tarjan's algorithm written
// as a loop over an explicit stack (a chain of 100,000 cells must not overflow the call stack), and
// every step - an edge followed, a column of cells jumped - is counted against a limit, so a hostile
// sheet cannot make the search run for long. When the limit is reached the search stops and says so;
// the components it had finished are real.

interface Cycle {
  /** Formula node numbers, ascending. */
  readonly members: readonly number[];
}

export interface CycleSearch {
  readonly cycles: readonly Cycle[];
  /** Cycles found beyond the listing limit. */
  readonly notListed: number;
  /** The step limit, when the search stopped on it. */
  readonly stoppedAfter?: number;
}

export interface CycleLimits {
  readonly maxCycleWork: number;
  readonly maxCyclesListed: number;
}

/** The formula nodes of one sheet sorted by column and then row, for a question about a box. */
interface FormulaIndex {
  readonly keys: Float64Array;
  readonly ids: Int32Array;
}

function indexOfSheet(project: Project, sheetId: number): FormulaIndex {
  const sheet = project.sheets[sheetId];
  if (sheet === undefined) return { keys: new Float64Array(0), ids: new Int32Array(0) };
  const { grid, formulaIds } = sheet;
  const keys: number[] = [];
  const ids: number[] = [];
  for (const k of grid.byColumn) {
    const id = at(formulaIds, k);
    if (id < 0) continue;
    keys.push(at(grid.cols, k) * POSITION + at(grid.rows, k));
    ids.push(id);
  }
  return { keys: Float64Array.from(keys), ids: Int32Array.from(ids) };
}

function lowerBound(keys: Float64Array, target: number): number {
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (at(keys, middle) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

interface Frame {
  readonly node: number;
  readonly next: number[];
  at: number;
}

class Search {
  private readonly index: Int32Array;
  private readonly low: Int32Array;
  private readonly onStack: Uint8Array;
  private readonly stack: number[] = [];
  private readonly self = new Set<number>();
  private readonly indexes: (FormulaIndex | undefined)[] = [];
  private counter = 0;
  private work = 0;
  readonly found: number[][] = [];
  stopped = false;
  private readonly project: Project;
  private readonly store: RefStore;
  private readonly maxWork: number;

  constructor(project: Project, store: RefStore, nodes: number, maxWork: number) {
    this.project = project;
    this.store = store;
    this.maxWork = maxWork;
    this.index = new Int32Array(nodes).fill(-1);
    this.low = new Int32Array(nodes);
    this.onStack = new Uint8Array(nodes);
  }

  get steps(): number {
    return this.work;
  }

  /** Hands the server back every `ROOTS_PER_TURN` roots (RF-159). */
  *run(nodes: number): Generator<void, void, undefined> {
    for (let root = 0; root < nodes && !this.stopped; root += 1) {
      if (at(this.index, root) < 0) this.from(root);
      if (root % ROOTS_PER_TURN === ROOTS_PER_TURN - 1) yield;
    }
  }

  private tick(): boolean {
    this.work += 1;
    if (this.work > this.maxWork) this.stopped = true;
    return !this.stopped;
  }

  private formulasIn(sheet: number, box: RefBox, out: number[]): void {
    const index = (this.indexes[sheet] ??= indexOfSheet(this.project, sheet));
    let i = lowerBound(index.keys, box.c1 * POSITION + box.r1);
    while (i < index.keys.length && this.tick()) {
      const key = at(index.keys, i);
      const col = Math.floor(key / POSITION);
      if (col > box.c2) return;
      const row = key - col * POSITION;
      if (row < box.r1) i = lowerBound(index.keys, col * POSITION + box.r1);
      else if (row > box.r2) i = lowerBound(index.keys, (col + 1) * POSITION + box.r1);
      else {
        out.push(at(index.ids, i));
        i += 1;
      }
    }
  }

  private successors(node: number): number[] {
    const out: number[] = [];
    const { from, to } = this.store.rangeOf(node);
    for (let r = from; r < to && !this.stopped; r += 1) {
      this.formulasIn(this.store.sheetAt(r), this.store.boxAt(r), out);
    }
    return out;
  }

  private enter(node: number): Frame {
    this.index[node] = this.counter;
    this.low[node] = this.counter;
    this.counter += 1;
    this.stack.push(node);
    this.onStack[node] = 1;
    return { node, next: this.successors(node), at: 0 };
  }

  private from(root: number): void {
    const frames: Frame[] = [this.enter(root)];
    while (frames.length > 0 && !this.stopped) {
      const frame = frames[frames.length - 1];
      if (frame === undefined) break;
      const successor = frame.next[frame.at];
      if (successor !== undefined) {
        frame.at += 1;
        this.follow(frame.node, successor, frames);
      } else {
        frames.pop();
        this.leave(frame.node, frames[frames.length - 1]?.node);
      }
    }
  }

  private follow(node: number, successor: number, frames: Frame[]): void {
    if (successor === node) this.self.add(node);
    if (at(this.index, successor) < 0) frames.push(this.enter(successor));
    else if (this.onStack[successor] === 1) {
      this.low[node] = Math.min(at(this.low, node), at(this.index, successor));
    }
  }

  private leave(node: number, parent: number | undefined): void {
    if (parent !== undefined) this.low[parent] = Math.min(at(this.low, parent), at(this.low, node));
    if (at(this.low, node) !== at(this.index, node)) return;
    const members: number[] = [];
    let member: number | undefined;
    do {
      member = this.stack.pop();
      if (member === undefined) break;
      this.onStack[member] = 0;
      members.push(member);
    } while (member !== node);
    if (members.length > 1 || this.self.has(node)) this.found.push(members.sort((a, b) => a - b));
  }
}

/** The circular references among `nodes` formula cells, within the step limit. */
export function findCycles(
  project: Project,
  store: RefStore,
  nodes: number,
  limits: CycleLimits,
): CycleSearch {
  return drive(findCyclesSteps(project, store, nodes, limits));
}

/** The same search, handing the server back while it runs (RF-159). */
export function* findCyclesSteps(
  project: Project,
  store: RefStore,
  nodes: number,
  limits: CycleLimits,
): Generator<void, CycleSearch, undefined> {
  const search = new Search(project, store, nodes, limits.maxCycleWork);
  yield* search.run(nodes);
  const sorted = [...search.found].sort((a, b) => at(a, 0) - at(b, 0));
  const listed = sorted.slice(0, limits.maxCyclesListed);
  return {
    cycles: listed.map((members) => ({ members })),
    notListed: sorted.length - listed.length,
    ...(search.stopped ? { stoppedAfter: limits.maxCycleWork } : {}),
  };
}
