import type { WorkbookModel } from './workbook-model.js';

// RF-152: stub, replaced by the implementation in the next commit.
export const WORKBOOK_RENDERER_VERSION = '1';

export interface RenderedFile {
  readonly path: string;
  readonly content: string;
}

export interface RenderedName {
  readonly segment: string;
  readonly kind: 'workbook' | 'sheet';
  readonly name: string;
}

export interface RenderedWorkbook {
  readonly folder: string;
  readonly files: readonly RenderedFile[];
  readonly names: readonly RenderedName[];
  readonly counts: {
    readonly sheets: number;
    readonly nonEmptyCells: number;
    readonly formulas: number;
  };
}

export interface RenderLimits {
  readonly maxTotalBytes: number;
}

export function renderWorkbooks(
  models: readonly WorkbookModel[],
  limits?: RenderLimits,
): RenderedWorkbook[] {
  return limits === undefined ? models.map(() => emptyRender()) : [];
}

function emptyRender(): RenderedWorkbook {
  return { folder: '', files: [], names: [], counts: { sheets: 0, nonEmptyCells: 0, formulas: 0 } };
}

export function renderWorkbook(model: WorkbookModel, limits?: RenderLimits): RenderedWorkbook {
  return limits === undefined && model.sheets.length < 0 ? emptyRender() : emptyRender();
}
