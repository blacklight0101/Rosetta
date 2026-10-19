import type { JSX } from 'preact';
import type { WorkbookSummary } from '../api/workbook-upload.js';
import { Link } from '../components/Link.js';
import { bytesText } from '../lib/bytes.js';
import type { WorkbookItem } from './use-workbook-upload.js';
import type { FileState } from './workbook-batch.js';

// RF-150, RF-158, RFC-005 section 4.9, design-system.md section 14 (Projects): the parts of the Excel
// workbooks form: the chosen files with where each one is, the progress bar, and the summary of a
// finished batch. File names are drawn as text, in a `bdi` so right-to-left characters in a name
// cannot reorder what is around it.

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

function stateText(state: FileState, percent: number): string {
  switch (state) {
    case 'waiting':
      return 'Waiting';
    case 'sending':
      return `Sending ${String(percent)}%`;
    case 'sent':
      return 'Sent';
    case 'failed':
      return 'Failed';
    case 'unsent':
      return 'Not sent';
  }
}

function Name({ text }: { readonly text: string }): JSX.Element {
  return <bdi class="rst-mono rst-zip__file">{text}</bdi>;
}

export function ChosenFiles({ items }: { readonly items: readonly WorkbookItem[] }): JSX.Element {
  return (
    <ul class="rst-wb__files" aria-label="Chosen workbooks">
      {items.map((item) => (
        <li key={`${item.file.name}-${String(item.file.size)}`} class="rst-wb__file">
          <Name text={item.file.name} /> ({bytesText(item.file.size)}){' '}
          <span class="rst-wb__state" data-state={item.state}>
            {stateText(item.state, item.percent)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Problems({ problems }: { readonly problems: readonly string[] }): JSX.Element {
  return (
    <ul id="workbook-problems" class="rst-zip__steps">
      {problems.map((problem) => (
        <li key={problem}>{problem}</li>
      ))}
    </ul>
  );
}

export function Progress(props: {
  readonly current: number;
  readonly total: number;
  readonly percent: number;
}): JSX.Element {
  const { current, total, percent } = props;
  return (
    <div
      class="rst-cap-meter"
      role="progressbar"
      aria-label="Upload progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`File ${String(current)} of ${String(total)}: ${String(percent)}% sent`}
    >
      <div class="rst-cap-meter__fill" style={{ inlineSize: `${String(percent)}%` }} />
    </div>
  );
}

function Skipped({
  skipped,
}: {
  readonly skipped: WorkbookSummary['skipped'];
}): JSX.Element | null {
  if (skipped.length === 0) return null;
  return (
    <>
      <p>{plural(skipped.length, 'item', 'items')} left out:</p>
      <ul class="rst-wb__list">
        {skipped.map((item) => (
          <li key={`${item.name}-${item.reason}`}>
            <Name text={item.name} />: {item.reason}
          </li>
        ))}
      </ul>
    </>
  );
}

export function Summary(props: {
  readonly summary: WorkbookSummary;
  readonly projectId: string | undefined;
}): JSX.Element {
  const { summary, projectId } = props;
  return (
    <div class="rst-callout rst-callout--info rst-zip__summary">
      <p role="status">{plural(summary.workbooks.length, 'workbook', 'workbooks')} read.</p>
      <ul class="rst-wb__list">
        {summary.workbooks.map((book) => (
          <li key={book.name}>
            <Name text={book.name} />: {plural(book.sheets, 'sheet', 'sheets')},{' '}
            {plural(book.cells, 'cell', 'cells')}, {plural(book.formulas, 'formula', 'formulas')},{' '}
            {plural(book.macroModules, 'macro module', 'macro modules')}.
          </li>
        ))}
      </ul>
      <Skipped skipped={summary.skipped} />
      {projectId === undefined ? null : (
        <Link
          href={`/projects/${encodeURIComponent(projectId)}/start`}
          class="rst-button rst-button--primary"
        >
          Start a run
        </Link>
      )}
    </div>
  );
}
