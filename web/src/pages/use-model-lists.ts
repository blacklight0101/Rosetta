import { useEffect, useRef, useState } from 'preact/hooks';
import { getModelChoices } from '../api/models.js';
import { useApp } from '../app/app-context.js';
import type { ModelListState } from './model-lists.js';

// RF-405, DEC-156: the lists of models a page needs, one request for each provider that has a list
// (Anthropic, OpenAI, Ollama), however many roles use it. A provider that is not asked about is
// absent from the answer, and its roles keep the plain text field.

/** The providers whose models the server lists. */
const listedProviders: readonly string[] = ['anthropic', 'openai', 'ollama'];

// RF-405
export function useModelLists(
  providers: readonly string[],
): Readonly<Record<string, ModelListState>> {
  const { client } = useApp();
  const [lists, setLists] = useState<Readonly<Record<string, ModelListState>>>({});
  const asked = useRef(new Set<string>());
  const abort = useRef(new AbortController());
  const wanted = listedProviders.filter((provider) => providers.includes(provider)).join(',');

  useEffect(() => {
    for (const provider of wanted.split(',').filter((name) => name !== '')) {
      if (asked.current.has(provider)) continue;
      asked.current.add(provider);
      setLists((current) => ({ ...current, [provider]: { status: 'loading' } }));
      void getModelChoices(client, provider, abort.current.signal).then((result) => {
        if (abort.current.signal.aborted) return;
        const state: ModelListState = result.ok
          ? { status: 'ready', models: result.value.models, reason: result.value.reason }
          : { status: 'failed' };
        setLists((current) => ({ ...current, [provider]: state }));
      });
    }
  }, [client, wanted]);

  useEffect(() => {
    const controller = abort.current;
    return () => {
      controller.abort();
    };
  }, []);

  return lists;
}
