import type { JSX } from 'preact';
import type { MeasureFigures } from '../api/understanding.js';
import { Glyph } from '../components/Glyph.js';
import {
  countText,
  measureRows,
  standingOf,
  type MeasureSet,
} from '../lib/understanding/measure-text.js';
import { DeepenOutcome } from './DeepenOutcome.js';
import type { UnderstandingLoad } from './use-understanding.js';

// RF-231, RF-230, RF-209, RFC-003 section 6: what an ended understand run read and confirmed, at the
// top of the Overview tab: the first-party coverage by tokens, the files not read, the Supported
// share with its counts, the claims not judged, the rejected claims no Supported claim replaces,
// and the third-party and generated code apart. It never says "complete"; "well covered" needs 80%
// of the first-party tokens read and no claim left unjudged. A Deepen run adds each measure before
// and after. All the styles are under `.rst-p241-`.

function Standing({ measures }: { readonly measures: MeasureSet }): JSX.Element {
  const standing = standingOf(measures);
  return (
    <p class="rst-p241-standing" data-testid="understanding-standing">
      <Glyph name={standing.wellCovered ? 'check' : 'open-circle'} />
      <span>{standing.text}</span>
    </p>
  );
}

function NotRead({ measures }: { readonly measures: MeasureFigures }): JSX.Element | null {
  const { filesNotRead, filesNotReadCount } = measures;
  if (filesNotReadCount === 0) return null;
  const more = filesNotReadCount - filesNotRead.length;
  return (
    <details class="rst-p241-notread">
      <summary>{`${countText(filesNotReadCount)} first-party files not read`}</summary>
      <ul aria-label="Largest files not read">
        {filesNotRead.map((file) => (
          <li key={file.path}>
            <span class="rst-mono">{file.path}</span>
            {` (${countText(file.tokens)} tokens)`}
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p>{`and ${countText(more)} more; the coverage table in the Evidence tab lists every file.`}</p>
      ) : null}
    </details>
  );
}

function Measures({ measures }: { readonly measures: MeasureFigures }): JSX.Element {
  return (
    <>
      <Standing measures={measures} />
      <dl class="rst-p241-measures">
        {measureRows(measures).map((row) => (
          <div key={row.id} class="rst-p241-measure" data-testid={`measure-${row.id}`}>
            <dt>{row.label}</dt>
            <dd>
              <b>{row.value}</b> <span>{row.detail}</span>
            </dd>
          </div>
        ))}
      </dl>
      <NotRead measures={measures} />
    </>
  );
}

function Body({ load }: { readonly load: UnderstandingLoad }): JSX.Element {
  if (load.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the measures
      </p>
    );
  }
  if (load.status === 'failed') {
    return <p class="rst-settings__note">The measures of this run could not be read.</p>;
  }
  const { measures, deepen } = load.understanding;
  return (
    <>
      {measures === null ? (
        <p class="rst-settings__note">This run has no measures to show.</p>
      ) : (
        <Measures measures={measures} />
      )}
      {deepen === null ? null : <DeepenOutcome deepen={deepen} />}
    </>
  );
}

// RF-231
export function UnderstandingSummary({ load }: { readonly load: UnderstandingLoad }): JSX.Element {
  return (
    <section class="rst-card rst-p241-summary" aria-label="Understanding measures">
      <h2 class="rst-live-section__title">What was read and confirmed</h2>
      <Body load={load} />
    </section>
  );
}
