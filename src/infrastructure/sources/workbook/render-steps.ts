import type {
  ProgressListener,
  WorkbookProgress,
} from '../../../application/ports/workbook-staging.js';
import type { WorkbookModel } from './workbook-model.js';

// RF-159, RNF-017, DEC-183: rendering is written once, as steps that yield a progress report each
// time the server can be handed back (before each sheet, between the passes of the dependency map).
// `drive` runs them to the end at once, as the synchronous render always did; `driveAsync` waits for
// the event loop between steps and asks `check` for a stop (cancel, the time bound) at each one.

export type Steps<T> = Generator<WorkbookProgress, T, undefined>;

/** What the asynchronous driver does at each step. */
export interface Pacing {
  /** Throws the reason when the request was stopped or the time bound passed. */
  readonly check: () => void;
  readonly onProgress?: ProgressListener;
}

/** Runs the steps to the end without handing the server back. */
export function drive<T>(steps: Generator<unknown, T, undefined>): T {
  for (;;) {
    const next = steps.next();
    if (next.done === true) return next.value;
  }
}

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const sameAs = (a: WorkbookProgress, b: WorkbookProgress | undefined): boolean =>
  a.step === b?.step && a.workbook === b.workbook && a.sheet === b.sheet && a.sheets === b.sheets;

/** Runs the steps, handing the server back at each one; a stop ends them before the next step. */
export async function driveAsync<T>(steps: Steps<T>, pacing: Pacing): Promise<T> {
  let last: WorkbookProgress | undefined;
  for (;;) {
    pacing.check();
    const next = steps.next();
    if (next.done === true) return next.value;
    if (!sameAs(next.value, last)) pacing.onProgress?.(next.value);
    last = next.value;
    await nextTurn();
  }
}

/** Steps that report `tick` each time the inner steps hand the server back. */
export function* relay<T>(
  inner: Generator<unknown, T, undefined>,
  tick: WorkbookProgress,
): Steps<T> {
  for (;;) {
    const next = inner.next();
    if (next.done === true) return next.value;
    yield tick;
  }
}

export function cellsOf(models: readonly WorkbookModel[]): number {
  return models.reduce(
    (sum, model) => sum + model.sheets.reduce((inner, sheet) => inner + sheet.cells.length, 0),
    0,
  );
}
