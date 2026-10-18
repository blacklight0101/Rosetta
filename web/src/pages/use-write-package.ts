import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { startPlanRun } from '../api/plan.js';
import { useApp } from '../app/app-context.js';
import { navigate } from '../app/router.js';

// RF-604, RF-143: "Write the package" starts the plan run of the project, with the consent of the
// planner when it needs one, and opens the live page of the run. A refusal stays on the page.

// RF-604
export function useWritePackage(
  projectId: string,
  consent: boolean,
): {
  readonly busy: boolean;
  readonly error: ApiFailure | undefined;
  readonly write: () => void;
} {
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>(undefined);
  const write = (): void => {
    setBusy(true);
    setError(undefined);
    void startPlanRun(client, projectId, consent).then((result) => {
      if (result.ok) {
        navigate(`/runs/${encodeURIComponent(result.value.id)}`);
        return;
      }
      setBusy(false);
      setError(result.error);
    });
  };
  return { busy, error, write };
}
