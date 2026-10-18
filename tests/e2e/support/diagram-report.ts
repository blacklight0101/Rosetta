import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDiagrams } from '../../../src/application/report/report-diagrams.js';
import type { Card } from '../../../src/domain/cards/card.js';
import { entityDiagram } from '../../../src/domain/diagrams/entity-diagram.js';
import { entityModelOf } from '../../../src/domain/diagrams/entity-model.js';
import { flowSequenceDiagram } from '../../../src/domain/diagrams/flow-sequence.js';
import { screenMapDiagram } from '../../../src/domain/diagrams/screen-map.js';
import { NodeOutputWriter } from '../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { FileReportWriter } from '../../../src/infrastructure/report/file-report-writer.js';
import { buildSiteFiles } from '../../../src/infrastructure/report/published-site.js';
import { loadDiagramAssets } from '../../../src/infrastructure/report/report-assets.js';
import { fallbackSecurityHeaders } from '../../../src/presentation/web/security-headers.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { reportModel } from '../../support/report-fixtures.js';
import { scopeFor } from '../../support/run-event-fixtures.js';

// RF-508, RF-507, RF-501: the report of a run whose documents hold diagrams, written by the real
// report writer into a folder (opened from disk) and as the published site (served under a
// sub-path, with the headers of the application). Names, labels and steps are hostile: they hold
// Mermaid syntax, HTML and a `javascript:` link, and every payload would set `window.__pwned` if
// it ran. The generators draw them (RF-508); one more diagram is written by hand with the same
// payloads in its source, and one cannot be parsed at all.

const templates = fileURLToPath(new URL('../../../templates/report/', import.meta.url));
const citation = { path: 'src/Orders/Checkout.cs', startLine: 3, endLine: 9 };

/** Mermaid syntax, HTML and a `javascript:` link in one name. */
const payload =
  "end\"] click a \"javascript:window.__pwned='click'\" <img src=x onerror=\"window.__pwned='img'\"> <script>window.__pwned='script'</script>";

/** The diagram that cannot be parsed, and the heading it sits under. */
export const brokenTitle = 'Broken diagram';
/** The hand-written diagram that carries the payloads in its source, and its heading. */
export const rawTitle = 'Hostile source';
/** The diagrams the generators draw: the screen map, the flow and the data model. */
export const generatedTitles = ['Screens', `FLOW-001 ${payload}`, 'Entities'] as const;

const raw = [
  'flowchart LR',
  `  a["<img src=x onerror=window.__pwned='img'>"] --> b["<script>window.__pwned='script'</script>"]`,
  `  click a "javascript:window.__pwned='click'"`,
  `  click b call window.__pwned()`,
  `  b --> c["<a href='javascript:window.__pwned=1'>link</a>"]`,
].join('\n');
const broken = 'flowchart LR\n  a --- (((';

function card(id: string, type: Card['type'], extra: Partial<Card>): Card {
  const claim = { claimId: `${id}.c1`, text: payload, citations: [citation], status: 'Supported' };
  return {
    ...{ id, type, title: payload, summary: payload, area: 'orders', agentTaskId: 'task-1' },
    ...{ confidence: 'High', claims: [{ ...claim, status: 'Supported' }], ...extra },
  };
}

const cards: readonly Card[] = [
  card('SCRN-001', 'SCRN', {
    screen: { route: payload, roles: [payload], fields: [], actions: [], leadsTo: ['SCRN-002'] },
  }),
  card('SCRN-002', 'SCRN', {
    screen: { route: '/done', roles: [], fields: [], actions: [], leadsTo: [payload] },
  }),
  card('FLOW-001', 'FLOW', { flow: { trigger: payload, outcome: payload } }),
  card('ENT-001', 'ENT', {}),
];

const fence = (source: string): string => ['```mermaid', source.trimEnd(), '```', ''].join('\n');
const flow = cards.find((each) => each.type === 'FLOW');

/** The specification and the data model of the run, with the diagrams of RF-508 in them. */
function documents(): Record<string, string> {
  return {
    'spec.md': [
      '## Screens',
      fence(screenMapDiagram(cards)),
      `### FLOW-001 ${payload}`,
      fence(flow === undefined ? '' : flowSequenceDiagram(flow, cards)),
      `## ${rawTitle}`,
      fence(raw),
      `## ${brokenTitle}`,
      fence(broken),
    ].join('\n'),
    'data-model.md': ['## Entities', fence(entityDiagram(entityModelOf(cards)))].join('\n'),
  };
}

const diagrams = extractDiagrams(documents());
export const diagramCount = diagrams.length;

/** The run's report folder as `BuildReport` leaves it, written by the real report writer. */
export async function writeReportFolder(): Promise<{
  folder: string;
  remove: () => Promise<void>;
}> {
  const data = await mkdtemp(join(tmpdir(), 'rosetta-e2e-diagrams-'));
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  const writer = new NodeOutputWriter({ dataDir: data, logger });
  const scope = scopeFor('20261012-100000-understand');
  await new FileReportWriter({ writer, masker, assetsFolder: templates }).write(
    scope,
    reportModel({ diagrams }),
  );
  const parts = ['users', scope.userId, 'projects', scope.projectId, 'runs', scope.runKey];
  return {
    folder: join(data, ...parts, 'report'),
    remove: () => rm(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}

const types: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Answers with a file of the site under  and, like the application, with its security headers. */
function siteHandler(
  files: Readonly<Record<string, string>>,
  prefix: string,
): (request: IncomingMessage, response: ServerResponse) => void {
  const headers = fallbackSecurityHeaders('http://127.0.0.1');
  return (request, response) => {
    const url = request.url ?? '';
    const name = url.split('?')[0]?.slice(prefix.length) ?? '';
    const text = url.startsWith(prefix) ? files[name === '' ? 'index.html' : name] : undefined;
    for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
    response.statusCode = text === undefined ? 404 : 200;
    response.setHeader('content-type', types[extname(name)] ?? 'text/plain');
    response.end(text ?? 'not found');
  };
}

/** The published site of the run (RF-800) served under `prefix`, with the headers of the application. */
export async function serveSite(
  prefix: string,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const assets = {
    'report.css': await readFile(join(templates, 'report.css'), 'utf8'),
    'replay.js': await readFile(join(templates, 'replay.js'), 'utf8'),
    diagrams: await loadDiagramAssets(templates),
  };
  const files = buildSiteFiles(reportModel({ diagrams }), assets, new SecretMasker(), {});
  const server = createServer(siteHandler(files, prefix));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('The server has no port.');
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        // The browser keeps its connections open; the server may not wait for them.
        server.closeAllConnections();
      }),
  };
}
