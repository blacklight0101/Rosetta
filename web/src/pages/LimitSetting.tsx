import type { JSX } from 'preact';
import { NumberSetting, type SettingBase } from './SettingFields.js';
import {
  formatAmount,
  formatValue,
  numberOf,
  type LimitUnit,
  type Range,
} from './setting-limits.js';

// RF-002, DEC-116, DEC-117, P2-15: a numeric setting as a number field and a slider on the same
// value. The slider is bounded by the range (its `max` may be lower, for the confirm threshold),
// marks the template default under it and, when the value is away from that default, warns that
// keeping the default is the usual choice. The number field stays the place for an exact value.
// P2-26: the slider is named by its range, not by the field label, and a typed value outside the
// range gets an inline hint before Save.

interface LimitProps extends SettingBase {
  readonly value: string;
  readonly onInput: (value: string) => void;
  readonly range: Range;
  /** The top of the slider when it is lower than the range's own top. */
  readonly max?: number;
  readonly defaultValue: number;
  readonly unit: LimitUnit;
}

function describing(ids: readonly (string | undefined)[]): string | undefined {
  const present = ids.filter((id): id is string => id !== undefined);
  return present.length === 0 ? undefined : present.join(' ');
}

function WarningText(props: {
  readonly id: string;
  readonly text: string;
  /** A polite live region: the text is announced when it appears (P2-26). */
  readonly live?: boolean;
}): JSX.Element {
  return (
    <p
      id={props.id}
      role={props.live === true ? 'status' : undefined}
      class="rst-field__help rst-limit__warning"
    >
      {props.text}
    </p>
  );
}

/**
 * RF-002, P2-26: the hint for a typed number outside the slider's range (its ends are the range's
 * bottom and the slider's top), or undefined inside it and for text that is not a number.
 */
function outsideHint(
  current: number | undefined,
  range: Range,
  top: number,
  unit: LimitUnit,
): string | undefined {
  if (current === undefined || (current >= range.min && current <= top)) return undefined;
  const allowed = `${formatAmount(range.min, unit)} to ${formatAmount(top, unit)}`;
  return `${formatAmount(current, unit)} is outside the allowed range of ${allowed}. Save will refuse it.`;
}

interface RangeInputProps {
  readonly id: string;
  readonly label: string;
  readonly range: Range;
  readonly top: number;
  readonly unit: LimitUnit;
  readonly shown: number;
  readonly describedBy: string | undefined;
  readonly onInput: (value: string) => void;
}

/** The slider of a limit, named after its field so that the four sliders of one page differ. */
function RangeInput(props: RangeInputProps): JSX.Element {
  const { range, top, unit } = props;
  return (
    <input
      id={props.id}
      type="range"
      class="rst-limit__slider"
      aria-label={`${props.label} slider`}
      aria-describedby={props.describedBy}
      min={range.min}
      max={top}
      step={range.step}
      value={props.shown}
      onInput={(event) => {
        props.onInput(event.currentTarget.value);
      }}
    />
  );
}

// RF-002
export function LimitSetting(props: LimitProps): JSX.Element {
  const { id, value, range, unit, defaultValue } = props;
  const top = props.max ?? range.max;
  const current = numberOf(value);
  // A slider takes a value beyond its ends only by the browser's own clamping, so the number is
  // passed as it is; text that is not a number shows the bottom of the slider.
  const shown = current ?? range.min;
  const rangeId = `${id}-range`;
  const rangeTextId = `${rangeId}-text`;
  const warningId = `${rangeId}-warning`;
  const hintId = `${rangeId}-hint`;
  const defaultText = formatValue(defaultValue, unit);
  const differs = current !== undefined && current !== defaultValue;
  const hint = outsideHint(current, range, top, unit);
  const warning = `Differs from the default of ${defaultText}. Keep the default unless you have a reason to change it.`;
  const describedBy = describing([
    rangeTextId,
    hint === undefined ? undefined : hintId,
    differs ? warningId : undefined,
  ]);
  return (
    <div class="rst-limit">
      <NumberSetting
        id={id}
        label={props.label}
        path={props.path}
        help={props.help}
        errorFor={props.errorFor}
        value={value}
        onInput={props.onInput}
        describedBy={hint === undefined ? undefined : hintId}
      />
      <RangeInput
        id={rangeId}
        label={props.label}
        range={range}
        top={top}
        unit={unit}
        shown={shown}
        describedBy={describedBy}
        onInput={props.onInput}
      />
      <p id={rangeTextId} class="rst-field__help">
        {`Default ${defaultText}. Allowed ${formatValue(range.min, unit)} to ${formatValue(top, unit)}.`}
      </p>
      {hint === undefined ? null : <WarningText id={hintId} text={hint} live />}
      {differs ? <WarningText id={warningId} text={warning} /> : null}
    </div>
  );
}
