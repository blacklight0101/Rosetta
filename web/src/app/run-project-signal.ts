import { createContext } from 'preact';

// RF-1002, RF-1105 (P8-27): a page of a run tells the shell which project the run belongs to.

export const RunProjectContext = createContext<(projectId: string | undefined) => void>(
  () => undefined,
);

// RF-1002
export function useAnnounceRunProject(projectId: string | undefined): void {
  if (projectId === '') return;
  // Filled in by the next commit.
}
