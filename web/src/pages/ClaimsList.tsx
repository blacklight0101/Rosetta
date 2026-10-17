import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import { RenderedText } from '../components/RenderedText.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { citationHref } from '../lib/live-run/claim-links.js';
import { judgementNote } from '../lib/live-run/judgement-state.js';
import { formatCitationRef } from '../lib/live-run/citation-label.js';
import type { ClaimRow, SourceState } from '../lib/live-run/run-state.js';

// RF-1004, RF-1014, DEC-136, RF-507: the claims of the run with their status, the reason and a link to the
// cited lines. A claim that passed the citation check is "waiting for judgement" while the judgement
// step (RF-301) is queued or running, then shows its verdict; one the run left unjudged stays
// "citations checked" with a note that it was not judged. Claim text comes from a model and is
// shown as text.

/** More claims than this are summarised, so a long run does not draw thousands of rows. */
const MAX_SHOWN = 300;

function StatusOf(props: { readonly claim: ClaimRow; readonly pending: boolean }): JSX.Element {
  const { claim, pending } = props;
  if (claim.status !== 'CitationsChecked') {
    return <StatusBadge list="ClaimStatus" value={claim.status} />;
  }
  if (pending) {
    return (
      <span class="rst-badge rst-badge--info-tint" data-testid="status-badge">
        <Glyph name="clock" />
        Waiting for judgement
      </span>
    );
  }
  return (
    <span class="rst-badge rst-badge--info-tint" data-testid="status-badge">
      <Glyph name="check" />
      Citations checked
    </span>
  );
}

function Citations(props: {
  readonly claim: ClaimRow;
  readonly source: SourceState | undefined;
}): JSX.Element | null {
  if (props.claim.citations.length === 0) return null;
  return (
    <ul class="rst-live-claim__lines" aria-label="Cited lines">
      {props.claim.citations.map((citation) => {
        const label = formatCitationRef(citation);
        const href = citationHref(props.source, citation);
        return (
          <li key={label} class="rst-mono">
            {href === undefined ? (
              label
            ) : (
              <a href={href} rel="noopener noreferrer" target="_blank">
                {label}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ClaimItem(props: {
  readonly claim: ClaimRow;
  readonly source: SourceState | undefined;
  readonly pending: boolean;
}): JSX.Element {
  const { claim } = props;
  return (
    <li class="rst-live-claim" data-testid="claim">
      <div class="rst-live-claim__head">
        <span class="rst-mono rst-live-claim__id">{claim.claimId}</span>
        <StatusOf claim={claim} pending={props.pending} />
      </div>
      {claim.text === undefined ? null : (
        <p class="rst-live-claim__text">
          <RenderedText text={claim.text} />
        </p>
      )}
      <Citations claim={claim} source={props.source} />
      {claim.reason === undefined ? null : (
        <p class="rst-live-claim__reason" data-testid="claim-reason">
          <RenderedText text={claim.reason} />
        </p>
      )}
    </li>
  );
}

// RF-1004, RF-1014
export function ClaimsList(props: {
  readonly claims: readonly ClaimRow[];
  readonly source: SourceState | undefined;
  /** The judgement step is queued or running (`judgementPending`). */
  readonly pending: boolean;
}): JSX.Element {
  const { claims, source, pending } = props;
  const note = judgementNote(claims, pending);
  return (
    <section class="rst-live-claims rst-card" aria-label="Claims">
      <h2 class="rst-live-section__title">Claims</h2>
      {note === undefined ? null : <p class="rst-settings__note">{note}</p>}
      {claims.length === 0 ? (
        <p class="rst-settings__note">
          No claims yet. They appear here as the agents propose cards, and change status as they are
          checked.
        </p>
      ) : (
        <ol class="rst-live-claims__list">
          {claims.slice(0, MAX_SHOWN).map((claim) => (
            <ClaimItem key={claim.claimId} claim={claim} source={source} pending={pending} />
          ))}
        </ol>
      )}
      {claims.length > MAX_SHOWN ? (
        <p class="rst-settings__note">
          Showing the first {MAX_SHOWN} of {claims.length} claims.
        </p>
      ) : null}
    </section>
  );
}
