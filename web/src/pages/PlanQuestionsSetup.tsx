import type { JSX } from 'preact';
import type { Catalogue } from '../api/plan-schemas.js';
import { useRef, useState } from 'preact/hooks';
import { Button } from '../components/Button.js';
import { PlanRecorded } from './PlanRecorded.js';
import type { PlanSession } from './use-plan-session.js';
import { RunAnswers, type AcceptRegistry } from './RunAnswers.js';
import { useRunAnswers } from './use-run-answers.js';

// RF-647, RF-645, RF-615, DEC-178, DEC-204: the open questions of the run and the Plan setup answers
// on one screen, each on its recommended answer (a Plan setup line still on it reads "(default)").
// "Accept the recommended answers" saves every open question that still waits, on the option it
// shows, writes the planning brief with the defaults for the rest, and the estimate below then
// offers "Start the plan": the plan never starts by itself. A question whose option was changed is
// saved as changed.

export interface PlanQuestionsSetupProps {
  /** The understand run whose open questions are listed; none while the project has no run. */
  readonly runId: string | undefined;
  /** Its `useDefaults` writes the brief with the recommended answers for what was not answered. */
  readonly session: PlanSession;
  readonly catalogue: Catalogue;
}

// RF-647
export function PlanQuestionsSetup(props: PlanQuestionsSetupProps): JSX.Element {
  const { runId } = props;
  const answers = useRunAnswers(runId ?? '', runId !== undefined);
  const registry = useRef<AcceptRegistry>(new Map()).current;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const accept = async (): Promise<void> => {
    setBusy(true);
    setNote('');
    let allSaved = true;
    for (const save of [...registry.values()]) {
      if (!(await save())) {
        allSaved = false;
        break;
      }
    }
    setBusy(false);
    if (allSaved) props.session.useDefaults();
    else setNote('A question could not be saved. Fix it above, then accept again.');
  };
  return (
    <section class="rst-plan-card" aria-label="Questions and plan setup">
      <h2 class="rst-plan-card__title">Questions and plan setup</h2>
      <p class="rst-plan-note">
        Every question below is on its recommended answer. Change only the ones you care about, then
        accept the recommended answers: they are saved in answers.md and the planning brief, and the
        plan waits for you to start it.
      </p>
      {runId === undefined ? null : (
        <RunAnswers runId={runId} answers={answers} accept={registry} />
      )}
      <PlanRecorded draft={props.session.draft} catalogue={props.catalogue} />
      <p class="rst-settings__note" role="status">
        {note}
      </p>
      <Button
        variant="primary"
        busy={busy || props.session.saving}
        onClick={() => {
          void accept();
        }}
      >
        Accept the recommended answers
      </Button>
    </section>
  );
}
