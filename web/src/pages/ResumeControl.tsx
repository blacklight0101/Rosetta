import type { JSX } from 'preact';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import { isResumable } from '../lib/live-run/resumable.js';
import { ResumeButton } from './ResumeButton.js';

// RF-006, design-system.md section 14: what the head of the run page offers once the run has ended
// at a cap, failed or was interrupted: Resume, and for a cap the reminder to raise it first.

export interface ResumeControlProps {
  readonly runId: string;
  readonly stage: string;
  readonly phase: RunPhase;
  readonly onResumed: () => void;
}

// RF-006
export function ResumeControl(props: ResumeControlProps): JSX.Element | null {
  const { phase } = props;
  if (phase.kind !== 'ended' || !isResumable(props.stage, phase.endState)) return null;
  return (
    <>
      <ResumeButton runId={props.runId} onResumed={props.onResumed} />
      {phase.endState === 'CapReached' ? (
        <span class="rst-live-head__note" data-testid="resume-note">
          Raise the cap in the project settings first, then resume.
        </span>
      ) : null}
    </>
  );
}
