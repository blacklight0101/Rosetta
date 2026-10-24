import type { PlannerCall } from '../../src/application/plan/ask-planner.js';
import type { LlmProvider, LlmRequest } from '../../src/application/ports/llm-provider.js';
import { ManifestUpdates } from '../../src/application/runs/manifest-updates.js';
import { MemoryRunManifestStore } from '../../src/infrastructure/files/memory-run-manifest-store.js';
import type { SourceCard } from '../../src/domain/planning/plan-sources.js';
import { card } from './data-model-sqlserver-orders.js';
import { fakeResponse } from './fake-recordings.js';
import { scopeFor } from './run-event-fixtures.js';
import { sampleRun } from './run-fixtures.js';

// P5-38: a school-like set of entities (synthetic, written for this repository) and a scripted planner
// that answers the data-model call the way a recording would: the tables of the entity cards it is
// shown, or an answer cut at the output limit when the message holds too many entities or a named one.

/** `count` entity cards; entity n states the table `tn` with an identity key and three columns. */
export function schoolEntities(count: number): SourceCard[] {
  return Array.from({ length: count }, (_unused, at) => {
    const n = String(at + 1).padStart(3, '0');
    return card(`ENT-${n}`, 'ENT', `Entity ${n}`, [
      `The t${n} table has an identity id and columns name, size (int), due (numeric 10,3) and kind (varchar 20).`,
      'Kind is a foreign key to the t001 table.',
    ]);
  });
}

export interface Script {
  /** A batch with more entities than this is answered cut at the limit. */
  readonly maxEntities: number;
  /** An entity id whose presence in a message always gets a cut answer. */
  readonly poison?: string | undefined;
}

function idsIn(message: string): string[] {
  const block = message.split('"otherEntities"')[0] ?? message;
  return [...new Set([...block.matchAll(/"id": "(ENT-\d+)"/gu)].map((match) => match[1] ?? ''))];
}

function tableFor(id: string): unknown {
  const n = id.slice(4);
  const columns = [
    { name: 'id', type: 'integer', nullable: false, legacy: { claim: `${id}.c1`, field: 'id' } },
    { name: 'name', type: 'text', nullable: true, legacy: { claim: `${id}.c1`, field: 'name' } },
  ];
  return {
    ...{ name: `t${n}`, purpose: 'Keeps rows.', sources: [id], columns },
    ...{ primaryKey: ['id'], uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
  };
}

export function scriptedPlanner(script: Script): { call: PlannerCall; requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  const provider: LlmProvider = {
    complete(request) {
      requests.push(request);
      const message = request.messages.map((each) => each.content).join('\n');
      const ids = idsIn(message);
      const cut = ids.length > script.maxEntities || ids.includes(script.poison ?? '-');
      const text = cut
        ? '{"tables": [{"name": "t001", "purpose": "Keeps'
        : JSON.stringify({ tables: ids.map(tableFor), dropped: [] });
      const usage = { inputTokens: 1, outputTokens: cut ? 4096 : 100 } as const;
      return Promise.resolve(
        fakeResponse({
          ...{ text, toolCalls: [], finishReason: cut ? 'length' : 'stop' },
          usage: { ...usage, cachedInputTokens: 0, usageSource: 'reported' },
        }),
      );
    },
  };
  let count = 0;
  const run = sampleRun({ stage: 'plan' });
  const call: PlannerCall = {
    run,
    planner: {
      ...{ provider, name: 'fake', kind: 'fake', model: 'm', maxOutputTokens: 4_096 },
      keySource: 'user',
    },
    prompt: { name: 'planner/data-model.v4.md', version: 'v4', sha256: 'b'.repeat(64), text: 'x' },
    continuePrompt: {
      name: 'planner/continue.v1.md',
      version: 'v1',
      sha256: 'a'.repeat(64),
      text: 'go',
    },
    agentTaskId: 'planner-data-model',
    updates: new ManifestUpdates(new MemoryRunManifestStore(), scopeFor()),
    tags: () => {
      count += 1;
      return `${'a'.repeat(23)}${'abcdefgh'[count % 8] ?? 'A'}`;
    },
    callId: () => `${run.runKey}#${String(count)}`,
    signal: new AbortController().signal,
    window: { windowTokens: 128_000, maxOutputTokens: 4_096 },
  };
  return { call, requests };
}
