import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import { judgementNote, verifyDetail } from '../lib/live-run/judgement-state.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1014, RF-1017, DEC-136: what the run checked about the claims behind the overview, in words and
// with a glyph: how many citations were checked and whether the judgement step ran. It is not shown
// for a run that wrote no claim. All the styles are under `.rst-p170-`.

// RF-1014
export function VerificationNote({ state }: { readonly state: RunState }): JSX.Element | null {
  const detail = verifyDetail(state);
  if (detail === undefined) return null;
  const note = judgementNote(state.claims, false);
  const invalid = state.claims.some((claim) => claim.status === 'CitationInvalid');
  return (
    <p class="rst-p170-note" data-testid="verification-note">
      <Glyph name={invalid ? 'warning-triangle' : 'check'} />
      <span>
        <b>Verification.</b> {detail}.{note === undefined ? '' : ` ${note}`}
      </span>
    </p>
  );
}
