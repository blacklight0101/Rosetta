import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ModelList } from '../../../../src/application/models/model-list.js';
import type { LlmRequest, LlmResponse } from '../../../../src/application/ports/llm-provider.js';
import type { LlmProvider } from '../../../../src/application/ports/llm-provider.js';
import type { ProviderSet } from '../../../../src/application/providers/provider-set.js';
import type { AgentRole } from '../../../../src/application/ports/llm-provider.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import { loadPriceTable } from '../../../../src/infrastructure/budget/price-file.js';
import { loadModelList } from '../../../../src/infrastructure/models/model-list-file.js';
import { textAnswer } from '../../../support/observed-harness.js';
import {
  callFor,
  factoryHarness,
  serverKeyText,
  settingsFor,
} from '../../../support/provider-factory-harness.js';

// RF-405, RF-422, Q-57: a new project (default roles, default caps: 0.50 USD a run) on any model of
// the shipped list lets the readers' parallel calls through the budget guard with a prompt of about
// 6,000 tokens, and lets the first planner call through. The guard reserves the worst case of each
// call in flight (its prompt and its whole output limit at the model's price), so an output limit
// that is too large for the cap refuses the third call of four in the middle of a run. Recorded
// fakes only: the adapter answers when the test lets it.

const prices = fileURLToPath(new URL('../../../../prices/default-prices.yaml', import.meta.url));
const models = fileURLToPath(new URL('../../../../prices/models.yaml', import.meta.url));
const SIX_THOUSAND_TOKENS = 'x'.repeat(24_000);

let priceTable: PriceTable;
let list: ModelList;

beforeAll(async () => {
  priceTable = await loadPriceTable(prices);
  list = await loadModelList(models);
});

/** An adapter that holds every call it receives until the test lets them all go. */
class HeldAdapter implements LlmProvider {
  started = 0;
  private release: () => void = () => undefined;
  private readonly gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  async complete(): Promise<LlmResponse> {
    this.started += 1;
    await this.gate;
    return textAnswer;
  }

  open(): void {
    this.release();
  }
}

async function setOn(
  entry: ModelList['models'][number],
  adapter: HeldAdapter,
): Promise<ProviderSet> {
  const target = { provider: entry.provider, model: entry.model };
  const settings = settingsFor({
    reader: target,
    verifier: target,
    planner: target,
    summariser: target,
  });
  const harness = factoryHarness({
    serverKeys: { anthropic: serverKeyText, openai: serverKeyText },
    priceTable,
    models: list,
    adapters: () => adapter,
  });
  const roles = ['reader', 'planner'] as const;
  const request = harness.request({ settings, roles, cloudConsent: true });
  const built = await harness.factory.build(request);
  if (!built.ok) throw new Error('The set was not built.');
  return built.value;
}

function promptFor(role: AgentRole, model: string, number: number, limit: number): LlmRequest {
  const messages = [{ role: 'user' as const, content: SIX_THOUSAND_TOKENS }];
  return callFor(role, model, number, { messages, tools: [], maxOutputTokens: limit });
}

/** Sends `count` calls of a role at once and reports how many the guard refused. */
async function refusedOf(entry: ModelList['models'][number], role: AgentRole, count: number) {
  const adapter = new HeldAdapter();
  const set = await setOn(entry, adapter);
  const each = set.get(role);
  if (each === undefined) throw new Error('No such role.');
  let refused = 0;
  const calls = Array.from({ length: count }, (_, index) =>
    each.provider
      .complete(promptFor(role, entry.model, index + 1, each.maxOutputTokens))
      .catch(() => {
        refused += 1;
      }),
  );
  await vi.waitFor(() => {
    expect(adapter.started + refused).toBe(count);
  });
  adapter.open();
  await Promise.all(calls);
  return refused;
}

// The models whose default calls the guard still refuses with the default run cap, because one call
// at their price (output at 20 to 50 USD a million) is a large part of 0.50 USD: they are listed so
// that a change in either direction is seen, and the owner decides what a project on them does
// (Q-57). Every other model of the list passes.
const readerRefused = [
  'claude-opus-5-5',
  'claude-fable-5-1',
  'gpt-6-astra',
  'gpt-5.6-sol',
  'gpt-5.5',
  'gpt-5.4',
];
const plannerRefused = ['claude-fable-5-1', 'gpt-6-astra', 'gpt-5.5'];

async function refusedModels(role: AgentRole, count: number): Promise<string[]> {
  const refused: string[] = [];
  for (const entry of list.models) {
    if ((await refusedOf(entry, role, count)) > 0) refused.push(entry.model);
  }
  return refused;
}

describe('the default caps and every model of the shipped list', () => {
  it('RF-422 Q-57 the default four parallel readers pass the budget guard on every listed model but these', async () => {
    expect(await refusedModels('reader', 4)).toEqual(readerRefused);
  });

  it('RF-422 Q-57 the first planner call passes the budget guard on every listed model but these', async () => {
    expect(await refusedModels('planner', 1)).toEqual(plannerRefused);
  });

  it('RF-422 Q-57 the first reader call passes on every listed model, Fable included', async () => {
    expect(await refusedModels('reader', 1)).toEqual([]);
  });
});
