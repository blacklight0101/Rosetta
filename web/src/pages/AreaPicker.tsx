import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { libraryLine, LIBRARY_REASON, matchesFilter, type AreaChoice } from './area-selection.js';

// RF-1018, P1-172, design-system.md section 14 (Start run): the areas of an understand run. Only
// the project's own code is listed (and ticked); library code is one line after the list that
// opens to the areas and their reason. Select all, Select none and Own code only change the choice
// in one step, and a filter narrows both lists by name. The list scrolls inside its panel.

export interface AreaPickerProps {
  readonly areas: readonly AreaChoice[];
  readonly onArea: (name: string) => void;
  readonly onChoose: (names: readonly string[]) => void;
}

interface Entry {
  readonly area: AreaChoice;
  readonly id: string;
}

function AreaRow({ area, id, onArea }: Entry & Pick<AreaPickerProps, 'onArea'>): JSX.Element {
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
          {LIBRARY_REASON}
        </span>
      ) : null}
    </div>
  );
}

function Toolbar(props: {
  readonly filter: string;
  readonly onFilter: (text: string) => void;
  readonly onChoose: AreaPickerProps['onChoose'];
  readonly names: { readonly all: readonly string[]; readonly own: readonly string[] };
}): JSX.Element {
  const { names, onChoose } = props;
  return (
    <div class="rst-start__toolbar">
      <div class="rst-start__filter">
        <Field
          kind="text"
          id="area-filter"
          label="Filter areas"
          value={props.filter}
          onInput={props.onFilter}
        />
      </div>
      <div class="rst-start__quick">
        <Button
          onClick={() => {
            onChoose(names.all);
          }}
        >
          Select all
        </Button>
        <Button
          onClick={() => {
            onChoose([]);
          }}
        >
          Select none
        </Button>
        <Button
          onClick={() => {
            onChoose(names.own);
          }}
        >
          Own code only
        </Button>
      </div>
    </div>
  );
}

function Empty(props: {
  readonly filter: string;
  readonly noun: string;
  readonly onClear: () => void;
}): JSX.Element {
  if (props.filter.trim() === '')
    return <p class="rst-settings__note">No {props.noun} in this code map.</p>;
  return (
    <p class="rst-settings__note">
      No area matches “{props.filter.trim()}”.{' '}
      <Button variant="ghost" onClick={props.onClear}>
        Clear filter
      </Button>
    </p>
  );
}

function entriesOf(areas: readonly AreaChoice[], thirdParty: boolean): readonly Entry[] {
  return areas
    .map((area, index) => ({ area, id: `area-${String(index)}` }))
    .filter((entry) => entry.area.thirdParty === thirdParty);
}

function LibraryAreas(props: {
  readonly library: readonly Entry[];
  readonly filter: string;
  readonly onArea: AreaPickerProps['onArea'];
}): JSX.Element {
  const shown = props.library.filter((entry) => matchesFilter(entry.area, props.filter));
  return (
    <div id="library-areas" class="rst-start__area-list">
      <fieldset class="rst-start__group">
        <legend>Library areas left out</legend>
        {shown.length === 0 ? <p class="rst-settings__note">No library area matches.</p> : null}
        {shown.map((entry) => (
          <AreaRow key={entry.area.name} {...entry} onArea={props.onArea} />
        ))}
      </fieldset>
    </div>
  );
}

/** The one line after the list that names the library areas left out and opens them. */
function LibraryLine(props: {
  readonly library: readonly Entry[];
  readonly open: boolean;
  readonly onToggle: () => void;
}): JSX.Element | null {
  if (props.library.length === 0) return null;
  return (
    <p class="rst-start__library-line" data-testid="library-areas-line">
      {libraryLine(props.library.map((entry) => entry.area))}.{' '}
      <button
        type="button"
        class="rst-button rst-button--ghost"
        aria-expanded={props.open}
        aria-controls="library-areas"
        onClick={props.onToggle}
      >
        {props.open ? 'Hide' : 'Show'}
      </button>
    </p>
  );
}

// RF-1018
export function AreaPicker(props: AreaPickerProps): JSX.Element {
  const { areas, onArea, onChoose } = props;
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const own = entriesOf(areas, false);
  const library = entriesOf(areas, true);
  const shown = own.filter((entry) => matchesFilter(entry.area, filter));
  const names = {
    all: areas.map((area) => area.name),
    own: own.map((entry) => entry.area.name),
  };
  const empty = own.length === 0 ? 'own-code area' : 'area';
  return (
    <div class="rst-start__picker">
      <Toolbar {...{ filter, names, onChoose }} onFilter={setFilter} />
      <div class="rst-start__area-list">
        <fieldset class="rst-start__group">
          <legend>Areas from the code map</legend>
          {shown.length === 0 ? (
            <Empty
              filter={filter}
              noun={empty}
              onClear={() => {
                setFilter('');
              }}
            />
          ) : null}
          {shown.map((entry) => (
            <AreaRow key={entry.area.name} {...entry} onArea={onArea} />
          ))}
        </fieldset>
      </div>
      <LibraryLine
        library={library}
        open={open}
        onToggle={() => {
          setOpen(!open);
        }}
      />
      {open && library.length > 0 ? <LibraryAreas {...{ library, filter, onArea }} /> : null}
    </div>
  );
}
