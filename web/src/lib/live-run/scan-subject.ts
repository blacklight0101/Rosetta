import type { SourceState } from './run-state.js';

// RF-150, RF-128: what a scan reads, in the words of the page. A GitHub project (and a run whose
// source the page has not seen yet) is "the repository"; a zip or workbooks are "the code or workbooks".

/** What a scan reads, for a project of this source kind (`github` when it is not known). */
export function scanSubjectOf(kind: 'github' | 'upload' | 'workbook' | undefined): string {
  return kind === 'upload' || kind === 'workbook' ? 'the code or workbooks' : 'the repository';
}

/** The same for the source a run's events named. */
export function scanSubjectOfRun(source: SourceState | undefined): string {
  return scanSubjectOf(source?.kind === 'upload' ? 'upload' : undefined);
}
