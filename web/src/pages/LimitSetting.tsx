import type { JSX } from 'preact';
import { NumberSetting, type SettingBase } from './SettingFields.js';
import { formatValue, numberOf, type LimitUnit, type Range } from './setting-limits.js';

// RF-002, DEC-116, DEC-117, P2-15: a numeric setting as a number field and a slider on the same
// value. The slider is bounded by the range (its `max` may be lower, for the confirm threshold),
// marks the template default under it and, when the value is away from that default, warns that
// keeping the default is the usual choice. The number field stays the place for an exact value.

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

function WarningText({ id, text }: { readonly id: string; readonly text: string }): JSX.Element {
  return (
    <p id={id} class="rst-field__help rst-limit__warning">
      {text}
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
  const allowed = `${formatValue(range.min, unit)} to ${formatValue(top, unit)}`;
  return `${formatValue(current, unit)} is outside the allowed range of ${allowed}. Save will refuse it.`;
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
      />
      <input
        id={rangeId}
        type="range"
        class="rst-limit__slider"
        // P2-26: named by its range, not by the field label, so a lookup by a field label finds the
        // number field only.
        aria-label={`Slider, ${formatValue(range.min, unit)} to ${formatValue(top, unit)}`}
        aria-describedby={describing([
          rangeTextId,
          hint === undefined ? undefined : hintId,
          differs ? warningId : undefined,
        ])}
        min={range.min}
        max={top}
        step={range.step}
        value={shown}
        onInput={(event) => {
          props.onInput(event.currentTarget.value);
        }}
      />
      <p id={rangeTextId} class="rst-field__help">
        {`Default ${defaultText}. Allowed ${formatValue(range.min, unit)} to ${formatValue(top, unit)}.`}
      </p>
      {hint === undefined ? null : <WarningText id={hintId} text={hint} />}
      {differs ? <WarningText id={warningId} text={warning} /> : null}
    </div>
  );
}
