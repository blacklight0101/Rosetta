import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project, ProjectSettings } from '../api/project-schemas.js';
import { problemFor } from '../api/problems.js';
import { saveProjectSettings } from '../api/projects.js';
import { useApp } from '../app/app-context.js';
import {
  draftOf,
  settingsOf,
  shownFields,
  type LocalProblem,
  type PriceDraft,
  type RoleDraft,
  type RoleName,
  type SettingsDraft,
} from './project-settings-form.js';

// RF-002, P1-41: the state of the project settings form. `useSettingsDraft` holds what the fields
// show and how each control changes it; `useSettingsSave` sends the document and keeps what the
// refusals say, so a field can show its own and the page can find the first one to focus.

export interface DraftEditor {
  readonly draft: SettingsDraft;
  readonly change: (patch: Partial<SettingsDraft>) => void;
  readonly changeRole: (name: RoleName, patch: Partial<RoleDraft>) => void;
  readonly changePrice: (index: number, patch: Partial<PriceDraft>) => void;
  readonly addPrice: () => void;
  readonly removePrice: (index: number) => void;
}

const emptyPrice: PriceDraft = { provider: 'openai', model: '', input: '', output: '', cached: '' };

export function useSettingsDraft(settings: ProjectSettings): DraftEditor {
  const [draft, setDraft] = useState(() => draftOf(settings));
  return {
    draft,
    change: (patch) => {
      setDraft((current) => ({ ...current, ...patch }));
    },
    changeRole: (name, patch) => {
      setDraft((current) => ({
        ...current,
        roles: { ...current.roles, [name]: { ...current.roles[name], ...patch } },
      }));
    },
    changePrice: (index, patch) => {
      setDraft((current) => ({
        ...current,
        prices: current.prices.map((price, at) => (at === index ? { ...price, ...patch } : price)),
      }));
    },
    addPrice: () => {
      setDraft((current) => ({ ...current, prices: [...current.prices, emptyPrice] }));
    },
    removePrice: (index) => {
      setDraft((current) => ({
        ...current,
        prices: current.prices.filter((_price, at) => at !== index),
      }));
    },
  };
}

/** Why the last save did not happen: text that is no number, or the server's answer. */
interface Refusal {
  readonly failure: ApiFailure | undefined;
  readonly local: readonly LocalProblem[];
}

/** What a field shows under it: the server's code when there is one, and the sentence. */
export interface FieldIssue {
  readonly code?: string;
  readonly message: string;
}

export interface SettingsSave {
  readonly busy: boolean;
  readonly message: string;
  /** Changes on every refusal; focus follows it. */
  readonly refusal: Refusal | undefined;
  /** What the last refusal said about the field, if anything. */
  readonly errorFor: (field: string) => FieldIssue | undefined;
  /** The refusal in a banner: all of it when it names no field, else the problems no field shows. */
  readonly banner: ApiFailure | undefined;
  readonly forgetRefusal: () => void;
  readonly save: () => Promise<void>;
}

function bannerOf(refusal: Refusal | undefined, draft: SettingsDraft): ApiFailure | undefined {
  const failure = refusal?.failure;
  if (failure === undefined) return undefined;
  const shown = shownFields(draft);
  const unplaced = failure.problems.filter((problem) => !shown.has(problem.field));
  if (failure.problems.length > 0 && unplaced.length === 0) return undefined;
  return { ...failure, problems: unplaced };
}

export function useSettingsSave(project: Project, draft: SettingsDraft): SettingsSave {
  const { client } = useApp();
  const [base, setBase] = useState(project.settings);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | undefined>();
  const [savedDraft, setSavedDraft] = useState<SettingsDraft | undefined>();

  const save = async (): Promise<void> => {
    const built = settingsOf(base, draft);
    if (!built.ok) {
      setRefusal({ failure: undefined, local: built.problems });
      return;
    }
    setBusy(true);
    const answer = await saveProjectSettings(client, project.id, built.settings);
    setBusy(false);
    if (!answer.ok) {
      setRefusal({ failure: answer.error, local: [] });
      return;
    }
    setBase(answer.value.settings);
    setRefusal(undefined);
    setSavedDraft(draft);
  };
  const errorFor = (field: string): FieldIssue | undefined => {
    const local = refusal?.local.find((problem) => problem.field === field);
    return local ?? problemFor(refusal?.failure, field);
  };
  return {
    busy,
    message: savedDraft === draft ? 'Settings saved.' : '',
    refusal,
    errorFor,
    banner: bannerOf(refusal, draft),
    forgetRefusal: () => {
      setRefusal(undefined);
    },
    save,
  };
}
