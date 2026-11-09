import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Project, ProjectSettings } from '../api/project-schemas.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { CapSettings, IgnoreRules, ScanSettings } from './LimitSettings.js';
import { ModelSettings } from './ModelSettings.js';
import { PriceOverrides } from './PriceOverrides.js';
import { everyRoleProviders, keyedProviders } from './every-role.js';
import { contextLimitOf, ollamaModels } from './ollama-context.js';
import { kindOfProvider, providerOptions } from './provider-choices.js';
import { roleStates } from './role-state.js';
import { roleWarningOf } from './role-warning.js';
import type { SectionProps } from './settings-section.js';
import type { SettingsDraft } from './project-settings-form.js';
import { useKeyAccess } from './use-key-access.js';
import { useModelLists } from './use-model-lists.js';
import { useSettingsDraft, useSettingsSave, type DraftEditor } from './use-settings-editor.js';

// RF-002, P1-41: the form of the project settings page. One form saves the whole document; a
// refusal shows next to each field it names, focus goes to the first of them, and what the page
// has no field for goes to a banner that names it.

/**
 * The model lists of the roles' providers and of the providers the user has a key for, the trained
 * context that bounds the Ollama field, the providers the every-role control lists (RF-436), the
 * warning on roles that cannot be used now (P8-74) and the State of each role (P8-135): Ollama is
 * always asked, as only its answer shows that it can be reached.
 */
function useRoleModels(settings: ProjectSettings, draft: SettingsDraft) {
  const access = useKeyAccess();
  const roles = Object.values(draft.roles).map((role) => role.provider);
  const lists = useModelLists([...roles, 'ollama', ...keyedProviders(settings, access ?? [])]);
  const ollama = lists['ollama'];
  const usable = everyRoleProviders(settings, access ?? [], ollama);
  return {
    lists,
    limit: contextLimitOf(ollamaModels(draft.roles), ollama),
    usable,
    warning: roleWarningOf(settings, { roles: draft.roles, access, ollama, usable }),
    states: roleStates(settings, draft.roles, access, ollama),
  };
}

// RF-002
/** P5-06: a link to a section (`#caps`) brings that section into view once the form is on the page. */
function useHashScroll(): void {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id !== '') document.getElementById(id)?.scrollIntoView();
  }, []);
}

function sectionOf(
  settings: ProjectSettings,
  editor: DraftEditor,
  errorFor: SectionProps['errorFor'],
): SectionProps {
  return {
    editor,
    errorFor,
    providers: providerOptions(settings),
    kindOf: kindOfProvider(settings),
  };
}

export function ProjectSettingsForm({ project }: { readonly project: Project }): JSX.Element {
  const drafting = useSettingsDraft(project.settings);
  const models = useRoleModels(project.settings, drafting.draft);
  const saving = useSettingsSave(project, drafting, models.limit);
  const formRef = useRef<HTMLFormElement>(null);
  useHashScroll();
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
  const section = sectionOf(project.settings, editor, saving.errorFor);
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
      <ModelSettings {...section} {...models} />
      <CapSettings {...section} roles={project.settings.budget.roles ?? {}} />
      <ScanSettings {...section} />
      <IgnoreRules {...section} />
      <PriceOverrides {...section} />
      <div class="rst-key-row__actions">
        <Button type="submit" variant="primary" busy={saving.busy}>
          Save settings
        </Button>
      </div>
      <div role="status">
        <p class="rst-settings__note">{saving.message}</p>
        {saving.notice === '' ? null : <p class="rst-settings__note">{saving.notice}</p>}
      </div>
    </form>
  );
}
