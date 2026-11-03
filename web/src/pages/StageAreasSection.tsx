import type { JSX } from 'preact';
import { AreaPicker } from './AreaPicker.js';
import { chosenOf, type AreaChoice } from './area-selection.js';
import { LibraryChoiceNotice } from './LibraryChoiceNotice.js';

// RF-1001, RF-200, RF-1018, RF-1022, design-system.md section 14: the areas of the code map
// (AreaPicker.tsx). There is no stage choice: the journey is understand (DEC-204).

export interface StageAreasProps {
  readonly areas: readonly AreaChoice[];
  readonly areasError: { readonly code: string; readonly message: string } | undefined;
  readonly onArea: (name: string) => void;
  readonly onChoose: (names: readonly string[]) => void;
  /** RF-1018: library areas are chosen and the user said they are wanted. */
  readonly libraryConfirmed: boolean;
  readonly onLibraryConfirm: (confirmed: boolean) => void;
}

function Areas(props: StageAreasProps): JSX.Element {
  const { areas, areasError, onArea, onChoose } = props;
  const chosen = chosenOf(areas);
  return (
    <div class="rst-start__areas">
      <AreaPicker areas={areas} onArea={onArea} onChoose={onChoose} />
      {chosen.libraryAreas === 0 ? null : (
        <LibraryChoiceNotice
          chosen={chosen}
          confirmed={props.libraryConfirmed}
          onConfirm={props.onLibraryConfirm}
        />
      )}
      {areasError === undefined ? null : (
        <p class="rst-field__error" data-testid="field-error" role="alert">
          {areasError.code} · {areasError.message}
        </p>
      )}
    </div>
  );
}

// RF-1001
export function StageAreasSection(props: StageAreasProps): JSX.Element {
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="stage-heading">
      <h2 id="stage-heading" class="rst-settings__heading">
        Areas
      </h2>
      <Areas {...props} />
    </section>
  );
}
