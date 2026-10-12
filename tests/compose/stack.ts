import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { z } from 'zod';

// RF-1301, P1-45: what the two specs of the Compose smoke test share. The stack listens on the
// fixed address of compose.yaml; the accounts and passwords come from the environment of the CI job
// (its .env), never from the repository (RNF-003).

export const origin = 'http://127.0.0.1:8080';
export const demoUrl = 'https://github.com/octo/demo';

/** The value of a required environment variable; the job writes them into .env before the run. */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set.`);
  return value;
}

export interface Credentials {
  readonly userName: string;
  readonly password: string;
}

/** The bootstrap administrator before its first sign-in: its password must be changed (RF-1102). */
export function firstCredentials(): Credentials {
  return { userName: required('ROSETTA_ADMIN_USER'), password: required('ROSETTA_ADMIN_PASSWORD') };
}

/** The same account after the smoke test chose its own password. */
export function chosenCredentials(): Credentials {
  return {
    userName: required('ROSETTA_ADMIN_USER'),
    password: required('ROSETTA_SMOKE_NEW_PASSWORD'),
  };
}

const session = z.object({ csrfToken: z.string().min(1) });
const created = z.object({ id: z.string().min(1) });
const projectList = z.object({ projects: z.array(z.object({ id: z.string(), name: z.string() })) });
const event = z.object({ type: z.string() }).loose();

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
}

interface Answer {
  readonly status: number;
  readonly text: string;
}

/**
 * A request made by the page itself, so it carries the page's session cookie and its own Origin
 * (the cookie is Secure, which Playwright's request client does not send over plain http).
 */
async function fromPage(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<Answer> {
  const token = method === 'GET' ? '' : await csrfToken(page);
  return page.evaluate(
    async (call) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (call.token !== '') headers['x-csrf-token'] = call.token;
      const answer = await fetch(call.path, { method: call.method, headers, body: call.body });
      return { status: answer.status, text: await answer.text() };
    },
    { method, path, token, body: body === undefined ? null : JSON.stringify(body) },
  );
}

async function csrfToken(page: Page): Promise<string> {
  const answer = await fromPage(page, 'GET', '/api/session');
  return session.parse(JSON.parse(answer.text)).csrfToken;
}

export async function projectsOf(page: Page): Promise<ProjectSummary[]> {
  const answer = await fromPage(page, 'GET', '/api/projects');
  return projectList.parse(JSON.parse(answer.text)).projects;
}

/** Starts a scan run of the project and returns its id. */
export async function startScan(page: Page, projectId: string): Promise<string> {
  const answer = await fromPage(page, 'POST', `/api/projects/${projectId}/runs`, { stage: 'scan' });
  if (answer.status !== 202)
    throw new Error(`Starting the scan answered ${String(answer.status)}.`);
  return created.parse(JSON.parse(answer.text)).id;
}

/** The event types of a run in order, read to the end of its stream (it closes after `run.ended`). */
export async function runEventTypes(page: Page, runId: string): Promise<string[]> {
  const answer = await fromPage(page, 'GET', `/api/runs/${runId}/events`);
  return answer.text
    .split(String.fromCharCode(10))
    .filter((line) => line.startsWith('data: '))
    .map((line) => event.parse(JSON.parse(line.slice('data: '.length))).type);
}

const stateFile = join(tmpdir(), 'rosetta-compose-smoke.json');
const state = z.object({ runId: z.string() });

/** Keeps the id of the scan run for the spec that runs after the restart. */
export async function rememberRun(runId: string): Promise<void> {
  await writeFile(stateFile, JSON.stringify({ runId }), 'utf8');
}

export async function rememberedRun(): Promise<string> {
  return state.parse(JSON.parse(await readFile(stateFile, 'utf8'))).runId;
}
