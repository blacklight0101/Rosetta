import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { PlannerCall } from '../../../src/application/plan/ask-planner.js';
import { planAdrModelCheck } from '../../../src/application/plan/plan-adr-model.js';
import type { AdrModelCheck } from '../../../src/domain/planning/adr-model-check.js';
import type { PlanDecision } from '../../../src/domain/planning/plan-content.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../src/infrastructure/handoff/file-handoff-writer.js';
import { loadAdrModelPrompt } from '../../../src/infrastructure/prompts/prompt-files.js';
import { ev95Calls, ev95Input } from '../../support/eshop-gap-round-fixtures.js';
import { handoffOf } from '../../support/handoff-package-fixture.js';

// P9-15, RF-623, EV-108, ADR-008: the eShop plan completed without the three hi-lo tables BR-006
// names while its ADR-001 decides "Hi-lo ids generated in the application". After the gap rounds
// the decision records that name a stored structure are checked against the data model in one
// planner call. The tables are those of the recorded eShop plan of EV-95; the records are the
// plan's ADR-001 and a record about a service, which names no structure and is not sent.
// tests/recordings/fake/planner-adr-model-eshop-ev108.json is a synthetic answer that names the
// hi-lo tables; planner-adr-model-unreadable.json is a synthetic answer in prose.

function decision(id: string, title: string, text: string): PlanDecision {
  return {
    ...{ id, title, context: 'The catalog needs ids.', decision: text, consequences: '' },
    ...{ sources: [], status: 'Proposed' as const, options: [] },
  };
}

const hilo = decision(
  'ADR-001',
  'Hi-lo ids generated in the application',
  'Catalog, brand and type ids are generated in the application from hi-lo sequences.',
);
const service = decision('ADR-002', 'Keep the catalog rules in one service', 'One service.');
const hiloTables = ['catalog_brand_hilo', 'catalog_hilo', 'catalog_type_hilo'];

async function checkOf(recording: string, decisions = [hilo, service]) {
  const { calls, provider } = await ev95Calls(recording);
  const prompt = await loadAdrModelPrompt('prompts');
  const call: PlannerCall = { ...calls.gap, prompt, agentTaskId: 'planner-adr-model' };
  const { dataModel } = (await ev95Input()).documents;
  const input = { decisions, dataModel };
  const check = await planAdrModelCheck(call, input);
  return { check, provider, call, input };
}

function checksOf(check: AdrModelCheck): string {
  const handoff = handoffOf('Plain text.', undefined, { adrModelCheck: check });
  const files = renderHandoff(handoff, new SecretMasker());
  return (files['checks.md'] ?? '').replaceAll('\\', '');
}

describe('the data model of the recorded eShop plan checked against its decisions (EV-108)', () => {
  it('RF-623 P9-15 sends only the records that name a structure, with the tables, as data', async () => {
    const { provider } = await checkOf('planner-adr-model-eshop-ev108.json');

    expect(provider.requests).toHaveLength(1);
    const [request] = provider.requests;
    expect(request?.system).toBe(await readFile('prompts/planner/adr-model.v1.md', 'utf8'));
    expect(request?.context).toMatchObject({ role: 'planner', agentTaskId: 'planner-adr-model' });
    const message = request?.messages.map((each) => each.content).join('\n') ?? '';
    expect(message).toContain('"id": "ADR-001"');
    expect(message).not.toContain('ADR-002');
    expect(message).toContain('"name": "catalog_items_stock"');
  });

  it('RF-623 P9-15 names the three hi-lo tables under ADR-001 and drops a table the model has', async () => {
    const { check } = await checkOf('planner-adr-model-eshop-ev108.json');

    expect(check?.kind).toBe('checked');
    const findings = check?.kind === 'checked' ? check.findings : [];
    expect(findings.map((each) => each.structure)).toEqual(hiloTables);
    expect(findings.every((each) => each.decision === 'ADR-001')).toBe(true);
    expect(check?.kind === 'checked' ? check.dropped : 0).toBe(1);
  });

  it('RF-623 P9-15 checks.md names the missing tables in a section of their own', async () => {
    const { check } = await checkOf('planner-adr-model-eshop-ev108.json');
    if (check === undefined) throw new Error('The check ran');

    const checks = checksOf(check);
    const section = checks.split('## Data model against the decisions')[1] ?? '';
    expect(section).toContain('ADR-001 (Hi-lo ids generated in the application): catalog_hilo');
    for (const table of hiloTables) expect(section).toContain(table);
    expect(section).toMatch(/1 structure of the answer was left out/u);
  });
});

describe('the check of the eShop data model when it cannot run or is not needed', () => {
  it('RF-623 P9-15 an answer that cannot be read does not fail the plan: the check could not run', async () => {
    const { check } = await checkOf('planner-adr-model-unreadable.json');

    expect(check).toEqual({
      kind: 'not-run',
      reason: 'the answer could not be read as the JSON the prompt asks for',
    });
    const checks = checksOf(check ?? { kind: 'checked', findings: [], dropped: 0 });
    expect(checks).toContain('## Data model against the decisions');
    expect(checks).toContain(
      'The check of the data model against the decision records could not run',
    );
    expect(checks).not.toContain('looks complete');
  });

  it('RF-623 P9-15 a call that fails does not fail the plan: the reason names its code', async () => {
    const { call, input } = await checkOf('planner-adr-model-eshop-ev108.json');

    // The recording holds one answer, so the call made again finds none (RST-1503).
    const again = await planAdrModelCheck(call, input);

    expect(again).toEqual({ kind: 'not-run', reason: 'the call failed or was refused (RST-1503)' });
  });

  it('RF-623 P9-15 no record names a structure: no call is made', async () => {
    const { check, provider } = await checkOf('planner-adr-model-eshop-ev108.json', [service]);

    expect(check).toBeUndefined();
    expect(provider.requests).toHaveLength(0);
  });
});
