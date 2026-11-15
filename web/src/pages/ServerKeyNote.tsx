import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { Glyph } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import {
  ceilingNoteText,
  estimateLinesOf,
  figureMovedText,
  missingKeyProviders,
} from '../lib/journey-approval.js';
import { providerNames } from './provider-choices.js';

// RF-1104, RF-1001, P1-107: a role that has no key of the user's own runs on the server's key. The
// page cannot see whether the server holds one, or whether the account may use it, so it says that
// the run may be refused (RST-2302, providerKeyMissing) and where to add an own key instead.
// RF-431: when the estimate knows a role has no usable key at all, it says the key is missing, and
// Start stays unavailable. RF-430: the journey total the user approves, and its worst case.

interface ServerKeyNoteProps {
  readonly estimate: RunEstimate;
  /** P9-14: the first read the page showed, kept by the section across reloads of the estimate. */
  readonly firstRead?: RunEstimate | undefined;
}

/** The providers whose roles run on the server's key in this estimate. */
function serverKeyProviders(estimate: RunEstimate): string {
  return providerNames(
    estimate.roles
      .filter((role) => role.keySource === 'server' && role.keyMissing !== true)
      .map((role) => role.provider),
  );
}

// RF-431
function KeyMissingNote({ estimate }: { readonly estimate: RunEstimate }): JSX.Element | null {
  const names = providerNames(missingKeyProviders(estimate));
  if (names === '') return null;
  return (
    <div class="rst-callout rst-callout--warn" data-testid="key-missing-note">
      <div class="rst-callout__row">
        <span class="rst-callout__icon">
          <Glyph name="exclamation" />
        </span>
        <p>
          Key missing: {names} has no key you can use, so the run would be refused (RST-2302). Add
          your own key in <Link href="/settings">Settings and keys</Link>, or ask the administrator
          to allow the server&apos;s key.
        </p>
      </div>
    </div>
  );
}

/**
 * DEC-206, RST-2310, P9-11: why the figure moved, against the first read this page showed. The page
 * keeps that read, so a figure that moved twice names where it began; it is gone when it moves back.
 */
function useFigureMoved(
  estimate: RunEstimate,
  firstRead: RunEstimate | undefined,
): string | undefined {
  // The section that owns the read keeps the first one across a reload; this one only as a fallback.
  const own = useRef(estimate);
  return figureMovedText(firstRead ?? own.current, estimate);
}

// RF-430, RF-434, RF-435, EV-85: the one sentence about the caps of a journey step.
const CAP_SENTENCE =
  'A step of the journey runs under this amount, which replaces the project run cap; the administrator caps and the day and month caps still stop a run for good. Pressing Analyse again later starts a new approval: the amount approved before no longer applies and the spend counts from zero.';

// RF-430, RF-434, P8-26: the journey as three short lines (likely, approved, what stops it), the
// ceiling and the reason a figure moved under them, and the longer explanation collapsed.
function JourneyNote(props: ServerKeyNoteProps): JSX.Element | null {
  const { estimate } = props;
  const { journey } = estimate;
  const lines = estimateLinesOf(estimate);
  const moved = useFigureMoved(estimate, props.firstRead);
  if (journey === undefined || lines === undefined) return null;
  const basis =
    journey.basis === 'history'
      ? 'From the measured totals of earlier runs of this model.'
      : 'From fixed assumptions: no earlier run of this model yet.';
  return (
    <div class="rst-p826-journey" data-testid="journey-total">
      <p class="rst-settings__note">
        The whole journey: understand with claim checking, {String(journey.deepenRounds)} Deepen
        rounds and the plan.
      </p>
      <dl class="rst-p241-measures">
        <div class="rst-p241-measure" data-testid="journey-likely">
          <dt>Likely</dt>
          <dd>{lines.likely}</dd>
        </div>
        <div class="rst-p241-measure" data-testid="journey-approved">
          <dt>Approved</dt>
          <dd>{lines.approved}</dd>
        </div>
        <div class="rst-p241-measure" data-testid="journey-stops">
          <dt>What stops it</dt>
          <dd>{lines.stops}</dd>
        </div>
      </dl>
      {moved === undefined ? null : (
        <p class="rst-settings__note" role="status" data-testid="journey-moved">
          {moved}
        </p>
      )}
      <details class="rst-p826-more">
        <summary>How these figures are worked out</summary>
        <p class="rst-settings__note">{`${ceilingNoteText(estimate) ?? ''} ${basis} ${CAP_SENTENCE}`}</p>
      </details>
    </div>
  );
}

// RF-1104
function ServerOnlyNote({ estimate }: { readonly estimate: RunEstimate }): JSX.Element | null {
  const names = serverKeyProviders(estimate);
  if (names === '') return null;
  return (
    <div class="rst-callout rst-callout--info" data-testid="server-key-note">
      <div class="rst-callout__row">
        <span class="rst-callout__icon">
          <Glyph name="exclamation" />
        </span>
        <p>
          {names} runs on the server&apos;s key. If the server holds no key for it, or your account
          may not use the server&apos;s keys, the run is refused (RST-2302). To use your own key,
          add it in <Link href="/settings">Settings and keys</Link>.
        </p>
      </div>
    </div>
  );
}

// RF-1104, RF-430, RF-431
export function ServerKeyNote(props: ServerKeyNoteProps): JSX.Element {
  const { estimate } = props;
  return (
    <>
      <JourneyNote {...props} />
      <KeyMissingNote estimate={estimate} />
      <ServerOnlyNote estimate={estimate} />
    </>
  );
}
