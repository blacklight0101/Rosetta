import type { WorkbookProgress } from '../../../application/ports/workbook-staging.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import type { WorkbookModel } from './workbook-model.js';
import { cellsOf, drive, driveAsync, relay, type Pacing, type Steps } from './render-steps.js';
import {
  DEFAULT_MAX_TOTAL_BYTES,
  renderProjectSteps,
  renderWorkbooksSteps,
  type RenderedProject,
} from './workbook-renderer.js';

// RF-153, RF-152, RST-1926: the workbooks of a zip rendered as one project, in place. When all of
// them together are over the byte limit, those that do not fit one after the other are refused and
// named, as a workbook of its own that cannot be rendered is; the map is part of the same limit, so
// the last workbook is dropped until the rest and their map fit. When none is left, every workbook
// is refused and the render holds no workbook; the map of nothing is not written (zip-workbooks),
// so its bytes are not held to the limit.

export interface Placed {
  readonly model: WorkbookModel;
  /** Where the workbook is rendered: its path in the zip. */
  readonly folder: string;
}

export interface ZipRender {
  /** The indexes of the workbooks that were rendered, in order; `rendered.workbooks` follows them. */
  readonly live: readonly number[];
  readonly rendered: RenderedProject;
  /** The workbooks left out, by index, and the error that stopped each. */
  readonly refused: ReadonlyMap<number, RosettaError>;
}

const bytesOf = (files: readonly { readonly content: string }[]): number =>
  files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);

/** The indexes of the workbooks that fit the limit one after the other, and the ones that do not. */
function* fit(
  items: readonly Placed[],
  limit: number,
  refused: Map<number, RosettaError>,
): Steps<number[]> {
  let budget = limit;
  const live: number[] = [];
  const cells = cellsOf(items.map((item) => item.model));
  for (const [index, item] of items.entries()) {
    const tick: WorkbookProgress = {
      step: 'rendering',
      ...{ workbook: index + 1, workbooks: items.length, cells },
      ...{ sheet: 0, sheets: item.model.sheets.length },
    };
    try {
      const steps = renderWorkbooksSteps([item.model], { maxTotalBytes: budget });
      const [book] = yield* relay(steps, tick);
      budget -= bytesOf(book?.files ?? []);
      live.push(index);
    } catch (error) {
      if (!(error instanceof RosettaError)) throw error;
      refused.set(index, error);
    }
  }
  return live;
}

function attempt(
  items: readonly Placed[],
  live: readonly number[],
  maxTotalBytes: number,
): Steps<RenderedProject> {
  const chosen = live.flatMap((index) => items[index] ?? []);
  return renderProjectSteps(
    chosen.map((item) => item.model),
    { maxTotalBytes, folders: chosen.map((item) => item.folder) },
  );
}

export function renderZip(
  items: readonly Placed[],
  maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
): ZipRender {
  return drive(renderZipSteps(items, maxTotalBytes));
}

/** The same render, handing the server back between sheets and passes (RF-159, RNF-017). */
export function renderZipAsync(
  items: readonly Placed[],
  maxTotalBytes: number | undefined,
  pacing: Pacing,
): Promise<ZipRender> {
  return driveAsync(renderZipSteps(items, maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES), pacing);
}

function* renderZipSteps(items: readonly Placed[], maxTotalBytes: number): Steps<ZipRender> {
  const refused = new Map<number, RosettaError>();
  let live = items.map((_, index) => index);
  let fitted = false;
  for (;;) {
    if (live.length === 0) {
      return { live, rendered: yield* attempt(items, live, DEFAULT_MAX_TOTAL_BYTES), refused };
    }
    try {
      return { live, rendered: yield* attempt(items, live, maxTotalBytes), refused };
    } catch (error) {
      if (!(error instanceof RosettaError)) throw error;
      if (!fitted) {
        live = yield* fit(items, maxTotalBytes, refused);
        fitted = true;
        continue;
      }
      const last = live[live.length - 1];
      if (last !== undefined) refused.set(last, error);
      live = live.slice(0, -1);
    }
  }
}
