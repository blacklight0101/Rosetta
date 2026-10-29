import { useCallback, useState } from 'preact/hooks';
import type { ApiClient, ApiFailure } from '../api/client.js';
import { savePlanningBrief } from '../api/plan.js';
import type { BriefView } from '../api/plan-schemas.js';
import { useApp } from '../app/app-context.js';
import { answersOf, draftOf, problemsOf, savedDraft, type Draft } from '../lib/plan-setup/draft.js';
import { STEP_IDS, type StepId } from '../lib/plan-setup/steps.js';

// RF-605, RF-611: the answers on the page, the step that is open and the saving of the planning
// brief. A save sends the questions the person answered; the page keeps what it shows, so a step
// opened again shows what was typed. "Finished" means the person went through the steps or took the
// defaults for the rest (or the project already has a saved brief): only then may the package be
// written.

/** What is wrong with the draft, by question id. */
type Problems = Readonly<Record<string, string>>;

export interface PlanSetupState {
  readonly draft: Draft;
  readonly step: StepId;
  readonly finished: boolean;
  readonly outOfDate: boolean;
  readonly saving: boolean;
  readonly error: ApiFailure | undefined;
  readonly problems: Problems;
}

export interface PlanSetupActions {
  readonly change: (next: Draft) => void;
  readonly goTo: (step: StepId) => void;
  readonly back: () => void;
  /** Saves the draft, or `accepted`: the draft with the choice the page showed taken as the answer. */
  readonly saveAndContinue: (accepted?: Draft) => void;
  readonly useDefaults: () => void;
}

const lastStep = STEP_IDS.length - 1;

interface Submitted {
  readonly problems: Problems;
  readonly error?: ApiFailure;
  /** Set when the brief was saved: whether a package written earlier is now out of date. */
  readonly outOfDate?: boolean;
}

/** Checks the draft, then saves what was answered; nothing is sent while a problem remains. */
async function submit(client: ApiClient, projectId: string, draft: Draft): Promise<Submitted> {
  const problems = problemsOf(draft);
  if (Object.keys(problems).length > 0) return { problems };
  const result = await savePlanningBrief(client, projectId, answersOf(draft));
  return result.ok
    ? { problems, outOfDate: result.value.outOfDate }
    : { problems, error: result.error };
}

// RF-605. An answer changed while a save is on its way stays: the save replaces only the draft it sent.
export function usePlanSetup(
  projectId: string,
  initial: BriefView,
  onSaved: () => void,
): PlanSetupState & PlanSetupActions {
  const { client } = useApp();
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial.brief));
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(initial.saved);
  const [outOfDate, setOutOfDate] = useState(initial.outOfDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>(undefined);
  const [problems, setProblems] = useState<Problems>({});
  const save = useCallback(
    async (then: 'next' | 'finish', sending: Draft, before: Draft): Promise<void> => {
      setSaving(true);
      setError(undefined);
      const saved = await submit(client, projectId, sending);
      setSaving(false);
      setProblems(saved.problems);
      if (saved.error !== undefined) setError(saved.error);
      if (saved.outOfDate === undefined) return;
      setDraft((current) => savedDraft(current === before ? sending : current));
      setOutOfDate(saved.outOfDate);
      if (then === 'finish' || index === lastStep) setFinished(true);
      else setIndex(index + 1);
      onSaved();
    },
    [client, projectId, index, onSaved],
  );
  return {
    draft,
    step: STEP_IDS[index] ?? 'principles',
    finished,
    outOfDate,
    saving,
    error,
    problems,
    change: setDraft,
    goTo: (step) => {
      setIndex(STEP_IDS.indexOf(step));
      setError(undefined);
    },
    back: () => {
      setIndex(Math.max(0, index - 1));
    },
    saveAndContinue: (accepted) => void save('next', accepted ?? draft, draft),
    useDefaults: () => void save('finish', draft, draft),
  };
}
