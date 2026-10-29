import type { JSX } from 'preact';
import type { DeepenRecordData } from '../api/understanding.js';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import { beforeAfterRows, stopText, type ChangeRow } from '../lib/understanding/measure-text.js';

// RF-231 scenario 2, RF-209: what a Deepen run changed, from the record in its manifest: each
// measure before and after with the change in words and a glyph (never colour alone), "supported
// after a re-read" listed apart, why the Deepen stopped, and the rejected claims it left out of
// scope. All the styles are under `.rst-p241-`.

const glyphs: Readonly<Record<ChangeRow['kind'], GlyphName | undefined>> = {
  better: 'check',
  worse: 'warning-triangle',
  same: 'open-circle',
  info: undefined,
};

const words: Readonly<Record<ChangeRow['kind'], string>> = {
  better: 'better',
  worse: 'worse',
  same: 'unchanged',
  info: '',
};

function Change({ row }: { readonly row: ChangeRow }): JSX.Element {
  const glyph = glyphs[row.kind];
  const lead = words[row.kind];
  return (
    <td data-label="Change">
      {glyph === undefined ? null : <Glyph name={glyph} />}
      {` ${lead === '' || row.kind === 'same' ? '' : `${lead}: `}${row.change}`}
    </td>
  );
}

function Table(props: { readonly rows: readonly ChangeRow[] }): JSX.Element {
  return (
    <div class="rst-table-scroll">
      <table class="rst-table rst-table--stack" aria-label="Before and after this Deepen">
        <caption class="rst-visually-hidden">Before and after this Deepen</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.id} data-testid={`change-${row.id}`}>
              <th scope="row">{row.label}</th>
              <td data-label="Before">{row.before}</td>
              <td data-label="After">{row.after}</td>
              <Change row={row} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutOfScope({ deepen }: { readonly deepen: DeepenRecordData }): JSX.Element | null {
  const count = deepen.outOfScope.length;
  if (count === 0) return null;
  return (
    <details class="rst-p241-scope" data-testid="deepen-out-of-scope">
      <summary>
        {`${String(count)} rejected claim${count === 1 ? ' was' : 's were'} left out of scope: they cite only third-party or generated code.`}
      </summary>
      <ul>
        {deepen.outOfScope.map((claim) => (
          <li key={claim.claimId}>
            <span class="rst-mono">{claim.claimId}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** DEC-179: how many of the answers the owner gave the Deepen used. */
function AnswersUsed({ count }: { readonly count: number }): JSX.Element | null {
  if (count === 0) return null;
  const text = count === 1 ? '1 answer you gave was' : `${String(count)} answers you gave were`;
  return <p data-testid="deepen-answers">{`${text} used by this Deepen.`}</p>;
}

// RF-231, RF-209
export function DeepenOutcome({ deepen }: { readonly deepen: DeepenRecordData }): JSX.Element {
  const { before, after } = deepen;
  return (
    <section class="rst-p241-deepen" aria-label="What this Deepen changed">
      <h3 class="rst-p241-subtitle">
        {'Deepen of run '}
        <Link href={`/runs/${encodeURIComponent(deepen.parentRunId)}`}>{deepen.parentRunKey}</Link>
      </h3>
      {deepen.stopReason === null ? null : (
        <p data-testid="deepen-stop">
          {stopText(deepen.stopReason, deepen.roundsDone, deepen.maxRounds)}
        </p>
      )}
      {before === null || after === null ? null : <Table rows={beforeAfterRows(before, after)} />}
      <AnswersUsed count={deepen.answersUsed} />
      <OutOfScope deepen={deepen} />
    </section>
  );
}
