import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { WorkbookProgress } from '../api/workbook-upload.js';
import { Button } from '../components/Button.js';

// RF-159, DEC-183, design-system.md section 14 (Projects, Excel workbooks): what the server is doing
// with the workbooks after the finish. The steps in order with the one at work marked, then the
// workbook and sheet, the cells read and the time. A screen reader hears the step when it changes (a
// polite status), never the counts or the clock, which change every second.

type Step = WorkbookProgress['step'];

const STEPS: readonly { readonly step: Step; readonly label: string; readonly saying: string }[] = [
  { step: 'reading', label: 'Reading workbooks', saying: 'Reading the workbooks.' },
  { step: 'rendering', label: 'Rendering sheets', saying: 'Rendering the sheets.' },
  { step: 'dependencies', label: 'Mapping dependencies', saying: 'Mapping the dependencies.' },
  { step: 'saving', label: 'Saving', saying: 'Saving the snapshot.' },
];

const count = (value: number): string => value.toLocaleString('en-US');

/** The elapsed time as minutes and seconds, 0:07 or 12:03. */
function clockText(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${String(Math.floor(seconds / 60))}:${rest}`;
}

function detailText(progress: WorkbookProgress | undefined): string {
  if (progress === undefined || progress.workbooks === 0) return 'Starting.';
  const where = `Workbook ${String(progress.workbook)} of ${String(progress.workbooks)}`;
  const sheets =
    progress.sheets === 0 ? '' : `, sheet ${String(progress.sheet)} of ${String(progress.sheets)}`;
  return `${where}${sheets}. ${count(progress.cells)} cells read.`;
}

const CANCEL_ID = 'rst-processing-cancel';

/**
 * RNF-010: a disabled button drops the keyboard focus to the page. While a Cancel waits, the focus moves
 * from the button to the status line, which says what is going on; when the button comes back the focus
 * goes back to it. A focus that was somewhere else is left alone.
 */
function useStoppingFocus(stopping: boolean): {
  readonly status: { current: HTMLParagraphElement | null };
} {
  const status = useRef<HTMLParagraphElement | null>(null);
  const was = useRef(false);
  useEffect(() => {
    const target = status.current;
    if (stopping && !was.current && document.activeElement?.id === CANCEL_ID) target?.focus();
    if (!stopping && was.current && document.activeElement === target) {
      document.getElementById(CANCEL_ID)?.focus();
    }
    was.current = stopping;
  }, [stopping]);
  return { status };
}

export interface ProcessingProgressProps {
  readonly progress: WorkbookProgress | undefined;
  readonly elapsedMs: number;
  /** Stops the work; absent where the work cannot be stopped from the page. */
  readonly onCancel?: (() => void) | undefined;
  /** The Cancel request is waiting for the work to end: the button reads "Stopping..." and is disabled. */
  readonly stopping?: boolean | undefined;
}

// RF-159
export function ProcessingProgress(props: ProcessingProgressProps): JSX.Element {
  const { progress, elapsedMs, onCancel, stopping = false } = props;
  const at = STEPS.findIndex((entry) => entry.step === progress?.step);
  const current = STEPS[Math.max(at, 0)];
  const { status } = useStoppingFocus(stopping);
  return (
    <section class="rst-wb__progress" aria-label="Reading the workbooks" data-testid="processing">
      <ol class="rst-wb__steps">
        {STEPS.map((entry, index) => (
          <li
            key={entry.step}
            data-state={index < at ? 'done' : index === Math.max(at, 0) ? 'current' : 'waiting'}
            aria-current={index === Math.max(at, 0) ? 'step' : undefined}
          >
            {entry.label}
          </li>
        ))}
      </ol>
      <p class="rst-wb__detail" data-testid="processing-detail">
        {detailText(progress)} <span class="rst-mono">{clockText(elapsedMs)}</span> elapsed.
      </p>
      <p class="rst-visually-hidden" role="status" aria-live="polite" tabIndex={-1} ref={status}>
        {stopping ? 'Stopping the work.' : current?.saying}
      </p>
      {onCancel === undefined ? null : (
        <Button id={CANCEL_ID} type="button" variant="secondary" busy={stopping} onClick={onCancel}>
          {stopping ? 'Stopping\u2026' : 'Cancel'}
        </Button>
      )}
    </section>
  );
}
