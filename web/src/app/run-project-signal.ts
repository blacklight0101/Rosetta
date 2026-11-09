import { createContext } from 'preact';
import { useContext, useEffect } from 'preact/hooks';

// RF-1002, RF-1105, P1-175 (P8-27, UX-26): the address of a run has no project in it, so the page of
// a run tells the shell which project its run belongs to, and the side menu shows that project's
// pages even when the page was opened by its address. The page takes it back when it is left.

export const RunProjectContext = createContext<(projectId: string | undefined) => void>(
  () => undefined,
);

/** Tells the shell the project of the run the page is about; takes it back on leaving. */
// RF-1002
export function useAnnounceRunProject(projectId: string | undefined): void {
  const announce = useContext(RunProjectContext);
  useEffect(() => {
    announce(projectId);
    return () => {
      announce(undefined);
    };
  }, [announce, projectId]);
}
