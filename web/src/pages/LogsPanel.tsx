import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { LOG_LEVELS, type LogLevel, type LogRow, type RunLogs } from '../api/call-schemas.js';
import { Glyph } from '../components/Glyph.js';
import { RenderedText } from '../components/RenderedText.js';
import { clockText } from '../lib/api-calls/format.js';
import { defaultLevels, visibleLogs, type LevelChoice } from '../lib/api-calls/log-filter.js';

// RF-1011, RF-009, DEC-57: the "Logs" panel: the application log entries of the run with a level
// filter and the count of security events, which filters the log to them. Entries carry text a
// model or a repository can influence, so they are shown as text. Styles are under `.rst-p137-`.

export interface LogsPanelProps {
  readonly logs: RunLogs;
}

function LevelToggle(props: {
  readonly level: LogLevel;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      class="rst-p137-toggle"
      aria-pressed={props.on ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={props.onToggle}
    >
      {props.on ? <Glyph name="check" /> : null}
      {props.level}
    </button>
  );
}

function Entry({ entry }: { readonly entry: LogRow }): JSX.Element {
  return (
    <li class="rst-p137-entry" data-testid="log-entry" data-level={entry.level}>
      <span class="rst-p137-entry__time">{clockText(entry.at)}</span>
      <span class={`rst-p137-entry__level rst-p137-entry__level--${entry.level}`}>
        {entry.level}
      </span>
      <span class="rst-p137-entry__logger">{entry.logger}</span>
      <span class="rst-p137-entry__message">
        <RenderedText text={entry.message} />
        {entry.code === undefined ? null : <span class="rst-p137-code"> {entry.code}</span>}
      </span>
    </li>
  );
}

function Entries({
  logs,
  shown,
}: {
  readonly logs: RunLogs;
  readonly shown: readonly LogRow[];
}): JSX.Element {
  if (logs.total === 0) {
    return (
      <p class="rst-settings__note">No log entries yet. They appear here as the run writes them.</p>
    );
  }
  return (
    <>
      {logs.total > logs.entries.length ? (
        <p class="rst-settings__note">
          Showing the newest {logs.entries.length} of {logs.total} entries.
        </p>
      ) : null}
      {shown.length === 0 ? (
        <p class="rst-settings__note">No entries match the choice above.</p>
      ) : (
        <ol class="rst-p137-entries" aria-label="Log entries">
          {shown.map((entry, index) => (
            <Entry key={`${entry.at}/${String(index)}`} entry={entry} />
          ))}
        </ol>
      )}
    </>
  );
}

// RF-1011
export function LogsPanel({ logs }: LogsPanelProps): JSX.Element {
  const [levels, setLevels] = useState<LevelChoice>(defaultLevels);
  const [securityOnly, setSecurityOnly] = useState(false);
  const shown = visibleLogs(logs.entries, levels, securityOnly);
  return (
    <section class="rst-card rst-p137-panel" aria-label="Logs">
      <div class="rst-p137-head">
        <h2 class="rst-live-section__title">Application log</h2>
        <div class="rst-p137-toggles" role="group" aria-label="Levels">
          {LOG_LEVELS.map((level) => (
            <LevelToggle
              key={level}
              level={level}
              on={levels[level]}
              disabled={securityOnly}
              onToggle={() => {
                setLevels({ ...levels, [level]: !levels[level] });
              }}
            />
          ))}
        </div>
        <button
          type="button"
          class="rst-p137-toggle rst-p137-toggle--security"
          aria-pressed={securityOnly ? 'true' : 'false'}
          onClick={() => {
            setSecurityOnly(!securityOnly);
          }}
        >
          Security events <strong>{logs.securityEvents}</strong>
        </button>
      </div>
      <Entries logs={logs} shown={shown} />
    </section>
  );
}
