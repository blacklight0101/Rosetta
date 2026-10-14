import type { JSX } from 'preact';
import type { RunStageChoice } from '../api/runs.js';

// RF-1001, RF-200, design-system.md section 14 (Start run): the stage and, for an understand run,
// the areas of the code map. Verify is drawn as the artboard has it but cannot be chosen: the
// server starts only a scan and an understand run in this release (RST-2305).

export interface AreaChoice {
  readonly name: string;
  readonly estimatedTokens: number | undefined;
  /** Only vendored or minified files (RF-1001): unticked by default and marked. */
  readonly thirdParty: boolean;
  readonly checked: boolean;
}

export interface StageAreasProps {
  readonly stage: RunStageChoice;
  /** False while the project has no completed scan: only a scan can start. */
  readonly understandAvailable: boolean;
  readonly areas: readonly AreaChoice[];
  readonly areasError: { readonly code: string; readonly message: string } | undefined;
  readonly onStage: (stage: RunStageChoice) => void;
  readonly onArea: (name: string) => void;
}

function StageChoice(props: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange?: () => void;
}): JSX.Element {
  return (
    <label class="rst-start__choice">
      <input
        type="radio"
        name="stage"
        id={props.id}
        checked={props.checked}
        disabled={props.disabled === true}
        onChange={props.onChange}
      />
      {props.label}
    </label>
  );
}

function Stages(props: StageAreasProps): JSX.Element {
  const { stage, understandAvailable, onStage } = props;
  return (
    <fieldset class="rst-start__group">
      <legend>Stage</legend>
      <div class="rst-start__choices">
        <StageChoice
          id="stage-scan"
          label="Scan only"
          checked={stage === 'scan'}
          onChange={() => {
            onStage('scan');
          }}
        />
        <StageChoice
          id="stage-understand"
          label="Understand"
          checked={stage === 'understand'}
          disabled={!understandAvailable}
          onChange={() => {
            onStage('understand');
          }}
        />
        <StageChoice
          id="stage-verify"
          label="Verify (not available yet)"
          checked={false}
          disabled
        />
      </div>
      {understandAvailable ? null : (
        <p class="rst-settings__note">
          Run a scan first: the areas and the estimate of an understand run come from its code map.
        </p>
      )}
    </fieldset>
  );
}

function AreaRow(props: {
  readonly area: AreaChoice;
  readonly id: string;
  readonly onArea: (name: string) => void;
}): JSX.Element {
  const { area, id, onArea } = props;
  const described = [
    area.estimatedTokens === undefined ? '' : `${id}-tokens`,
    area.thirdParty ? `${id}-third-party` : '',
  ].filter((each) => each !== '');
  return (
    <div class="rst-start__area">
      <input
        type="checkbox"
        id={id}
        checked={area.checked}
        aria-describedby={described.length === 0 ? undefined : described.join(' ')}
        onChange={() => {
          onArea(area.name);
        }}
      />
      <label for={id} class="rst-mono rst-start__area-name" title={area.name}>
        {area.name}
      </label>
      {area.estimatedTokens === undefined ? null : (
        <span id={`${id}-tokens`} class="rst-table__sub rst-start__area-tokens">
          {area.estimatedTokens.toLocaleString('en-US')} tokens
        </span>
      )}
      {area.thirdParty ? (
        <span
          id={`${id}-third-party`}
          class="rst-badge rst-badge--neutral-tint rst-start__area-note"
        >
          third-party
        </span>
      ) : null}
    </div>
  );
}

function Areas(props: StageAreasProps): JSX.Element {
  const { areas, areasError, onArea } = props;
  return (
    <fieldset class="rst-start__group">
      <legend>Areas from the code map</legend>
      {areas.map((area, index) => (
        <AreaRow key={area.name} area={area} id={`area-${String(index)}`} onArea={onArea} />
      ))}
      {areasError === undefined ? null : (
        <p class="rst-field__error" data-testid="field-error" role="alert">
          {areasError.code} · {areasError.message}
        </p>
      )}
    </fieldset>
  );
}

// RF-1001
export function StageAreasSection(props: StageAreasProps): JSX.Element {
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="stage-heading">
      <h2 id="stage-heading" class="rst-settings__heading">
        Stage and areas
      </h2>
      <Stages {...props} />
      {props.stage === 'understand' ? <Areas {...props} /> : null}
    </section>
  );
}
