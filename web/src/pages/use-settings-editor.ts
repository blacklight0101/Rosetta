import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project, ProjectSettings } from '../api/project-schemas.js';
import { problemFor } from '../api/problems.js';
import { saveProjectSettings, type SavedSettings } from '../api/projects.js';
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
import type { ContextLimit } from './ollama-context.js';

// RF-002, P1-41: the state of the project settings form. `useSettingsDraft` holds what the fields
// show and how each control changes it; `useSettingsSave` sends the document and keeps what the
// refusals say, so a field can show its own and the page can find the first one to focus.

export interface DraftEditor {
  readonly draft: SettingsDraft;
  /** How many edits the form has had; a revert to an earlier value is an edit too. */
  readonly edits: number;
  readonly change: (patch: Partial<SettingsDraft>) => void;
  readonly changeRole: (name: RoleName, patch: Partial<RoleDraft>) => void;
  readonly changePrice: (index: number, patch: Partial<PriceDraft>) => void;
  readonly addPrice: () => void;
  readonly removePrice: (index: number) => void;
}

type ParallelismChange = NonNullable<SavedSettings['parallelismChange']>;

const emptyPrice: PriceDraft = {
  provider: 'openai',
  model: '',
  input: '',
  output: '',
  cached: '',
  cacheWrite: '',
};

export function useSettingsDraft(settings: ProjectSettings): DraftEditor {
  const [state, setState] = useState(() => ({ draft: draftOf(settings), edits: 0 }));
  const update = (next: (current: SettingsDraft) => SettingsDraft): void => {
    setState((current) => ({ draft: next(current.draft), edits: current.edits + 1 }));
  };
  return {
    draft: state.draft,
    edits: state.edits,
    change: (patch) => {
      update((current) => ({ ...current, ...patch }));
    },
    changeRole: (name, patch) => {
      update((current) => ({
        ...current,
        roles: { ...current.roles, [name]: { ...current.roles[name], ...patch } },
      }));
    },
    changePrice: (index, patch) => {
      update((current) => ({
        ...current,
        prices: current.prices.map((price, at) => (at === index ? { ...price, ...patch } : price)),
      }));
    },
    addPrice: () => {
      update((current) => ({ ...current, prices: [...current.prices, emptyPrice] }));
    },
    removePrice: (index) => {
      update((current) => ({
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
  /** RF-436: what the save did to the parallel readers, while the form still shows what was stored. */
  readonly notice: string;
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

/** RF-436: the plain line for a save that raised the parallel readers because the reader went hosted. */
export function noticeOf(change: ParallelismChange | undefined): string {
  return change === undefined
    ? ''
    : `Parallel readers set from ${String(change.from)} to ${String(change.to)}, because the reader is no longer a local model.`;
}

/** What the last refusal said about the field, if anything. */
function issueIn(refusal: Refusal | undefined, field: string): FieldIssue | undefined {
  const local = refusal?.local.find((problem) => problem.field === field);
  return local ?? problemFor(refusal?.failure, field);
}

/** RF-436: a field the server changed shows what it stored (one more edit of the form); the save is current until the next edit. */
function showStored(
  editor: DraftEditor,
  change: ParallelismChange | undefined,
): { readonly edits: number; readonly notice: string } {
  if (change === undefined) return { edits: editor.edits, notice: '' };
  editor.change({ parallelism: String(change.to) });
  return { edits: editor.edits + 1, notice: noticeOf(change) };
}

export function useSettingsSave(
  project: Project,
  editor: DraftEditor,
  limit?: ContextLimit,
): SettingsSave {
  const { draft } = editor;
  const { client } = useApp();
  const [stored, setStored] = useState<Project>(project);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | undefined>();
  const [saved, setSaved] = useState<ReturnType<typeof showStored> | undefined>();

  const save = async (): Promise<void> => {
    const built = settingsOf(stored.settings, draft, limit);
    if (!built.ok) {
      setRefusal({ failure: undefined, local: built.problems });
      return;
    }
    setBusy(true);
    const answer = await saveProjectSettings(
      client,
      { id: project.id, settingsVersion: stored.settingsVersion },
      built.settings,
    );
    setBusy(false);
    if (!answer.ok) {
      setRefusal({ failure: answer.error, local: [] });
      return;
    }
    setStored(answer.value);
    setRefusal(undefined);
    setSaved(showStored(editor, answer.value.parallelismChange));
  };
  // Any edit after the save hides the message and the line for good, even one that restores the saved values.
  const current = saved?.edits === editor.edits;
  return {
    busy,
    message: current ? 'Settings saved.' : '',
    notice: current ? saved.notice : '',
    refusal,
    errorFor: (field) => issueIn(refusal, field),
    banner: bannerOf(refusal, draft),
    forgetRefusal: () => {
      setRefusal(undefined);
    },
    save,
  };
}
