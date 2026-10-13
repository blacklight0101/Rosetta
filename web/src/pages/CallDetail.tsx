import type { JSX } from 'preact';
import type { CallRow, TranscriptRow } from '../api/call-schemas.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { RenderedText } from '../components/RenderedText.js';
import { durationText, speedText } from '../lib/api-calls/format.js';
import { useCallTranscript, type TranscriptLoad } from './use-call-transcript.js';

// RF-1011, RF-408, RF-507: the selected call: what the provider log holds about it beyond its row
// (Ollama's own timings, the finish reason, the error) and its masked transcript. The transcript
// holds model and repository text, so it is shown as text. Styles are under `.rst-p137-`.

export interface CallDetailProps {
  readonly runId: string;
  readonly call: CallRow;
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: string;
}): JSX.Element {
  return (
    <div class="rst-p137-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Facts({ call }: { readonly call: CallRow }): JSX.Element {
  const { ollama } = call;
  return (
    <dl class="rst-p137-facts">
      <Fact label="Finish reason">{call.finishReason}</Fact>
      <Fact label="Endpoint">{call.endpointHost}</Fact>
      {call.errorCode === undefined ? null : <Fact label="Error code">{call.errorCode}</Fact>}
      {ollama === undefined ? null : (
        <>
          <Fact label="Load">{durationText(ollama.loadDurationMs)}</Fact>
          <Fact label="Prompt evaluation">{durationText(ollama.promptEvalDurationMs)}</Fact>
          <Fact label="Generation">{durationText(ollama.evalDurationMs)}</Fact>
          <Fact label="Speed">{speedText(ollama.tokensPerSecond)}</Fact>
        </>
      )}
    </dl>
  );
}

/** The arguments of a tool call as the JSON the model sent. */
const argumentsText = (value: unknown): string => JSON.stringify(value ?? null);

function Message({ entry }: { readonly entry: TranscriptRow }): JSX.Element {
  return (
    <li class="rst-p137-message" data-testid="transcript-message">
      <span class="rst-p137-message__role">{entry.role}</span>
      <div class="rst-p137-message__text">
        <RenderedText text={entry.content} />
      </div>
      {(entry.toolCalls ?? []).map((tool) => (
        <div key={tool.id} class="rst-p137-message__tool rst-mono">
          <RenderedText text={`${tool.name} ${argumentsText(tool.arguments)}`} />
        </div>
      ))}
    </li>
  );
}

function Transcript({
  call,
  load,
}: {
  readonly call: CallRow;
  readonly load: TranscriptLoad;
}): JSX.Element {
  if (load.status === 'none') {
    return <p class="rst-settings__note">No transcript was stored for this call.</p>;
  }
  if (load.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the transcript
      </p>
    );
  }
  if (load.status === 'failed') return <ErrorBanner error={load.error} />;
  if (load.entries.length === 0) {
    return <p class="rst-settings__note">The transcript holds no message for this call.</p>;
  }
  return (
    <ol class="rst-p137-messages" aria-label={`Transcript of call ${String(call.seq)}`}>
      {load.entries.map((entry) => (
        <Message key={entry.seq} entry={entry} />
      ))}
    </ol>
  );
}

// RF-1011
export function CallDetail({ runId, call }: CallDetailProps): JSX.Element {
  const load = useCallTranscript(runId, call.seq, call.hasTranscript);
  return (
    <section class="rst-card rst-p137-panel" aria-label="Selected call">
      <h2 class="rst-live-section__title">Call {call.seq}</h2>
      <p class="rst-settings__note">
        {`${call.provider} / ${call.model} · ${call.agent} · ${call.role}`}
      </p>
      <Facts call={call} />
      <Transcript call={call} load={load} />
    </section>
  );
}
