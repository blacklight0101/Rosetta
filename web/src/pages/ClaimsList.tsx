import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import { RenderedText } from '../components/RenderedText.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { citationHref } from '../lib/live-run/claim-links.js';
import { formatCitationRef } from '../lib/live-run/citation-label.js';
import type { ClaimRow, SourceState } from '../lib/live-run/run-state.js';

// RF-1004, DEC-103, RF-507: the claims of the run with their status, the reason and a link to the
// cited lines. In this release the model step of the verifier is not built, so a claim that passed
// the citation check is labelled "awaiting model verification". Claim text comes from a model and is
// shown as text.

/** More claims than this are summarised, so a long run does not draw thousands of rows. */
const MAX_SHOWN = 300;

function StatusOf({ claim }: { readonly claim: ClaimRow }): JSX.Element {
  if (claim.status !== 'AwaitingModel') {
    return <StatusBadge list="ClaimStatus" value={claim.status} />;
  }
  return (
    <span class="rst-badge rst-badge--info-tint" data-testid="status-badge">
      <Glyph name="clock" />
      Awaiting model verification
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
}): JSX.Element {
  const { claim } = props;
  return (
    <li class="rst-live-claim" data-testid="claim">
      <div class="rst-live-claim__head">
        <span class="rst-mono rst-live-claim__id">{claim.claimId}</span>
        <StatusOf claim={claim} />
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

// RF-1004
export function ClaimsList(props: {
  readonly claims: readonly ClaimRow[];
  readonly source: SourceState | undefined;
}): JSX.Element {
  const { claims, source } = props;
  return (
    <section class="rst-live-claims rst-card" aria-label="Claims">
      <h2 class="rst-live-section__title">Claims</h2>
      {claims.length === 0 ? (
        <p class="rst-settings__note">
          No claims yet. They appear here as the agents propose cards, and change status as they are
          checked.
        </p>
      ) : (
        <ol class="rst-live-claims__list">
          {claims.slice(0, MAX_SHOWN).map((claim) => (
            <ClaimItem key={claim.claimId} claim={claim} source={source} />
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
