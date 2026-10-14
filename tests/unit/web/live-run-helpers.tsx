import { screen, within } from '@testing-library/preact';
import { vi } from 'vitest';
import { LiveRunPage } from '../../../web/src/pages/LiveRunPage.js';
import { json, renderPage, type Answer, type RenderedPage } from './fake-api.js';
import { runKey, sourceState } from './live-run-fixtures.js';
import { StreamServer } from './stream-server.js';

// The live run page under test (P1-35): the real page over the fake API of fake-api.tsx and the
// fake event stream of stream-server.ts. The run is `runUuid`, the folder `runKey`.

export const runUuid = '2f0c4b1e-0000-4000-8000-000000000001';
export const runPath = `/api/runs/${runUuid}`;
export const estimatePath = '/api/projects/p-1/estimate';

interface RowOptions {
  readonly stage?: string;
  readonly queueState?: 'Queued' | 'Running' | 'Ended';
  readonly endState?: string | null;
  readonly costMicros?: number;
  readonly reportBuilt?: boolean;
}

/** What `GET /api/runs/:runId` answers. */
export function runRow(options: RowOptions = {}): Response {
  const { stage = 'understand', queueState = 'Running', endState = null } = options;
  const { costMicros = 0, reportBuilt = false } = options;
  return json(200, {
    id: runUuid,
    projectId: 'p-1',
    runId: runKey,
    stage,
    queueState,
    endState,
    queuedAt: '2026-10-12T09:59:00.000Z',
    startedAt: queueState === 'Queued' ? null : '2026-10-12T10:00:00.000Z',
    endedAt: null,
    commitSha: sourceState.commitSha,
    totals: { costMicros, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    reportBuilt,
  });
}

export interface LiveRun extends RenderedPage {
  readonly stream: StreamServer;
}

/** Opens the page of the run; `answers` replace or add to the run row and the estimate. */
export function renderLive(answers: Readonly<Record<string, Answer>> = {}): LiveRun {
  const stream = new StreamServer();
  vi.stubGlobal('fetch', stream.send);
  const page = renderPage(
    <LiveRunPage />,
    { [`GET ${runPath}`]: runRow(), ...answers },
    undefined,
    {
      runId: runUuid,
    },
  );
  return { ...page, stream };
}

/** The text of the `dd` that follows the `dt` with that label inside `scope`. */
export function valueOf(scope: HTMLElement, label: string): string {
  const term = within(scope).getByText(label, { selector: 'dt' });
  return term.nextElementSibling?.textContent ?? '';
}

export const agentPanel = (area: string): HTMLElement => screen.getByLabelText(`Agent ${area}`);

export async function findAgentPanel(area: string): Promise<HTMLElement> {
  return screen.findByLabelText(`Agent ${area}`);
}
