import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import type { Project } from '../api/project-schemas.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { CapSettings, IgnoreRules, ScanSettings } from './LimitSettings.js';
import { ModelSettings } from './ModelSettings.js';
import { PriceOverrides } from './PriceOverrides.js';
import { providerOptions } from './provider-choices.js';
import type { SectionProps } from './settings-section.js';
import { useSettingsDraft, useSettingsSave } from './use-settings-editor.js';

// RF-002, P1-41: the form of the project settings page. One form saves the whole document; a
// refusal shows next to each field it names, focus goes to the first of them, and what the page
// has no field for goes to a banner that names it.

// RF-002
export function ProjectSettingsForm({ project }: { readonly project: Project }): JSX.Element {
  const drafting = useSettingsDraft(project.settings);
  const saving = useSettingsSave(project, drafting.draft);
  const formRef = useRef<HTMLFormElement>(null);
  useRefusalFocus(formRef, saving.refusal);
  // Rows move when one is added or removed, so a refusal about row numbers no longer fits.
  const editor = {
    ...drafting,
    addPrice: () => {
      drafting.addPrice();
      saving.forgetRefusal();
    },
    removePrice: (index: number) => {
      drafting.removePrice(index);
      saving.forgetRefusal();
    },
  };
  const section: SectionProps = {
    editor,
    errorFor: saving.errorFor,
    providers: providerOptions(project.settings),
  };
  return (
    <form
      ref={formRef}
      class="rst-settings"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void saving.save();
      }}
    >
      {saving.banner === undefined ? null : <ErrorBanner error={saving.banner} />}
      <ModelSettings {...section} />
      <CapSettings {...section} />
      <ScanSettings {...section} />
      <IgnoreRules {...section} />
      <PriceOverrides {...section} />
      <div class="rst-key-row__actions">
        <Button type="submit" variant="primary" busy={saving.busy}>
          Save settings
        </Button>
      </div>
      <p class="rst-settings__note" role="status">
        {saving.message}
      </p>
    </form>
  );
}
