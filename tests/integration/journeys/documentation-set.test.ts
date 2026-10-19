import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  brokenLinks,
  cardIds,
  setProblems,
  uncoveredItems,
} from '../../support/documentation-set.js';
import { leaveDemoPackage, runJourney, type Journey } from '../../support/journey-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { filesOf, readZip } from '../../support/zip-reader.js';
import { useSharedValue } from '../../support/understand-full-run.js';

// RF-260..RF-263, RF-508, RF-620..RF-627, ADR-008, DEC-134, P3-22: the documentation set journey.
// One run of the demo (the webforms-shop fixture) through scan, understand and plan, every model
// answer a recording, then every document of the set read from the folders the runs left: the
// specification with flows, screens and the legacy data model, the report with its diagrams and the
// package (PRD, TRD, data model, API contract, flows, user-interface material, implementation plan).
// Set ROSETTA_JOURNEY_OUT to a folder to also leave the demo package there for the owner to read
// (P3-22 review; nothing is published, G-08).

const journey = useSharedValue('rosetta-journey-', async (dir) => {
  const made = await runJourney(dir);
  const out = process.env['ROSETTA_JOURNEY_OUT'];
  if (out !== undefined && out !== '') await leaveDemoPackage(made, out);
  return made;
});

const current = (): Journey => journey.current();

const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

describe('the documentation set journey: the three stages', () => {
  it('RF-604 scan, understand and plan all complete on the demo', () => {
    const { scan, understand, plan } = current();

    expect([scan.stage, scan.endState]).toEqual(['scan', 'Completed']);
    expect([understand.stage, understand.endState]).toEqual(['understand', 'Completed']);
    expect([plan.stage, plan.endState]).toEqual(['plan', 'Completed']);
  });

  it('ADR-008 every model call of the journey went to the fake provider', () => {
    const { specification } = current();

    const lines = (specification['provider-calls.jsonl'] ?? '').split('\n').filter((l) => l !== '');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toContain('"provider":"fake"');
  });

  it('RF-264 the reader, the summariser and the planner each made the calls the recordings hold', () => {
    const { providers } = current();

    const roles = providers.requests().map((request) => request.context.role);
    expect(roles.filter((role) => role === 'reader')).toHaveLength(8);
    expect(roles.filter((role) => role === 'summariser')).toHaveLength(1);
    expect(roles.filter((role) => role === 'planner')).toHaveLength(6);
    expect(providers.coverageRequests()).toHaveLength(1);
  });
});

describe('the documentation set journey: the whole set', () => {
  it('RF-620 every document of the set exists and none is empty, missing or marked Incomplete', () => {
    expect(setProblems(current())).toEqual([]);
  });

  it('RF-620 every relative link of the package resolves to a file of the package', () => {
    expect(brokenLinks(current().documents)).toEqual([]);
  });

  it('RF-620 the README lists the documents in the reading order, each linking its file', () => {
    const readme = current().documents['README.md'] ?? '';

    const order = [
      'prd.md',
      'trd.md',
      'data-model.md',
      'api/openapi.yaml',
      'flows/README.md',
      'ux/README.md',
    ];
    const at = order.map((file) => readme.indexOf(`](${file})`));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(readme.indexOf('](tasks.md)')).toBeGreaterThan(at[5] ?? Infinity);
  });
});

describe('the documentation set journey: the specification', () => {
  it('RF-260 RF-261 RF-262 RF-263 spec.md presents every flow and screen card and links the data model', () => {
    const { specification } = current();

    const spec = specification['spec.md'] ?? '';
    const data = specification['data-model.md'] ?? '';
    expect(cardIds(specification, 'FLOW')).toEqual(['FLOW-001', 'FLOW-002', 'FLOW-003']);
    expect(cardIds(specification, 'SCRN')).toHaveLength(4);
    for (const id of [...cardIds(specification, 'FLOW'), ...cardIds(specification, 'SCRN')]) {
      expect(spec).toContain(`### ${id} `);
    }
    for (const id of cardIds(specification, 'ENT')) {
      expect(data.match(new RegExp(`^### ${id} `, 'gmu'))).toHaveLength(1);
    }
    expect(spec).toContain('[data-model.md](data-model.md) (2 entities)');
    expect(data).toContain('erDiagram');
  });

  it('RF-262 the data model draws the relation a Supported claim states and lists it to confirm', () => {
    const data = current().specification['data-model.md'] ?? '';

    expect(data).toContain('e2 }o..o{ e1 : "stated by ENT#45;002.c2 #40;cardinality unknown#41;"');
    expect(data).toContain(
      String.raw`- ENT\-002 Basket line and ENT\-001 Catalog item (stated by ENT\-002.c2): cardinality unknown`,
    );
    expect(data).not.toContain('record no relations');
    const diagrams = current().report['diagrams.html'] ?? '';
    expect(diagrams).toContain('e2 }o..o{ e1');
  });

  it('RF-264 the overview opens the specification and names its cards', () => {
    const spec = current().specification['spec.md'] ?? '';

    expect(spec.indexOf('## Overview')).toBeLessThan(spec.indexOf('## Verification summary'));
    expect(spec).toContain('[FEAT-001](cards/FEAT/FEAT-001.md)');
  });
});

describe('the documentation set journey: the report diagrams', () => {
  it('RF-508 the report draws a sequence diagram per flow, the screen map and the entity diagram', () => {
    const { report } = current();

    const page = report['diagrams.html'] ?? '';
    expect(page.match(/sequenceDiagram/gu)).toHaveLength(3);
    expect(page.match(/erDiagram/gu)).toHaveLength(1);
    expect(page.match(/flowchart/gu)).toHaveLength(1);
    for (const asset of ['mermaid.min.js', 'diagrams.js']) expect(report[asset]).toBeDefined();
    // The two scripts are files of the report; no script is written into the page itself.
    const inline = page.replace(/<script src="[\w.-]+" defer><\/script>/giu, '');
    expect(inline).not.toMatch(/<script|\son\w+=|javascript:/iu);
  });
});

describe('the documentation set journey: coverage of the plan', () => {
  it('RF-627 the plan run is complete and checks.md lists no uncovered item', () => {
    const { plan, documents } = current();

    expect(plan.endState).toBe('Completed');
    expect(documents['checks.md']).toContain('Every item is built by at least one task card.');
    expect(documents['checks.md']).not.toMatch(/^\| (feature|table|operation|flow|screen) /mu);
  });

  it('RF-627 every feature, table, operation, journey and screen the files name has a task card', () => {
    expect(uncoveredItems(current().documents)).toEqual([]);
  });

  it('RF-623 the first card writes the migrations and builds every table of the data model', () => {
    const tasks = plain(current().documents['tasks.md']);

    const first = tasks.split(/^## /mu)[1] ?? '';
    expect(first).toMatch(/^T-001\n/u);
    expect(first).toContain('Write the database migrations in the chosen stack');
    expect(first).toContain('catalog_item');
    expect(first).toContain('basket_line');
  });
});

describe('the documentation set journey: screen claims', () => {
  it('RF-626 a screen detail the verifier rejected reaches neither the planner nor the wireframe', () => {
    const { specification, documents, providers } = current();

    expect(specification['spec.md']).toContain('SCRN-003.c7 [Rejected] Field ShippingList');
    const call = providers.requests().find((each) => each.context.agentTaskId === 'planner-ux');
    const sent = call?.messages.map((message) => message.content).join('\n') ?? '';
    expect(sent).toContain('EmailBox');
    expect(sent).not.toContain('ShippingList');
    const wireframe = documents['ux/wireframes/SCRN-003.html'] ?? '';
    expect(wireframe).toContain('EmailBox (text, required)');
    expect(wireframe).not.toContain('ShippingList');
  });

  it('RF-626 the wireframes hold no script, no event attribute and no external resource', () => {
    const wireframes = Object.entries(current().documents).filter(([path]) =>
      path.startsWith('ux/wireframes/'),
    );

    expect(wireframes).toHaveLength(3);
    for (const [, html] of wireframes) {
      expect(html).not.toMatch(/<script|\son\w+=|src=|<link|https?:\/\//iu);
    }
  });
});

describe('the documentation set journey: the package for the owner', () => {
  it('RF-505 the report of the plan run offers the package as one hand-off zip holding every document', async () => {
    const { documents, handoffZip } = current();

    const zipped = filesOf(await readZip(handoffZip));

    expect(Object.keys(documents).length).toBeGreaterThan(25);
    expect(zipped['prd.md'] ?? zipped['handoff/prd.md']).toBe(documents['prd.md']);
    const names = Object.keys(zipped).map((name) => name.replace(/^handoff\//u, ''));
    expect(names.sort()).toEqual(Object.keys(documents).sort());
  });

  const out = useTempRoot('rosetta-journey-out-');

  it('P3-22 leaves the specification, the package and the report in a folder for the owner to read', async () => {
    await leaveDemoPackage(current(), out.path);

    const top = await readdir(out.path);
    const specification = await readdir(join(out.path, 'specification'));
    expect(top.sort()).toEqual(['package', 'report', 'specification']);
    expect(specification).toContain('spec.md');
    expect(specification).not.toContain('transcripts');
    expect(specification).not.toContain('report');
    expect(await readdir(join(out.path, 'package'))).toContain('prd.md');
    expect(await readdir(join(out.path, 'report'))).toContain('diagrams.html');
  });
});
