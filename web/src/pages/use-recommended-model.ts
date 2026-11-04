import { useEffect, useRef } from 'preact/hooks';
import type { ModelListState } from './model-lists.js';
import { hasShippedList, recommendedModel } from './model-lists.js';
import type { RoleName } from './project-settings-form.js';
import type { DraftEditor } from './use-settings-editor.js';

// RF-436, P8-72: choosing a provider for a role selects its recommended model (the first model of
// the shipped list the role can use). When the list has not arrived yet, the role waits for it and
// takes the model then, unless the model was set in the meantime.

type Lists = Readonly<Record<string, ModelListState>>;

const needsTools = (role: RoleName): boolean => role === 'reader';

const isWaiting = (list: ModelListState | undefined): boolean =>
  list === undefined || list.status === 'loading';

// RF-436
export function useProviderChoice(
  editor: DraftEditor,
  lists: Lists,
): (role: RoleName, provider: string) => void {
  // The provider each waiting role was changed to; an effect that still sees the old draft skips it.
  const waiting = useRef(new Map<RoleName, string>());

  useEffect(() => {
    for (const [role, waitedFor] of [...waiting.current]) {
      const { provider, model } = editor.draft.roles[role];
      if (provider !== waitedFor) continue;
      const list = lists[provider];
      if (isWaiting(list)) continue;
      waiting.current.delete(role);
      const chosen = recommendedModel(provider, list, needsTools(role));
      if (model === '' && chosen !== undefined) editor.changeRole(role, { model: chosen });
    }
    // Only a list that arrives can end a wait; `editor` is read as of that render.
  }, [lists]);

  return (role, provider) => {
    const model = recommendedModel(provider, lists[provider], needsTools(role)) ?? '';
    editor.changeRole(role, { provider, model });
    if (model === '' && hasShippedList(provider) && isWaiting(lists[provider])) {
      waiting.current.set(role, provider);
    } else {
      waiting.current.delete(role);
    }
  };
}
