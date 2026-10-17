import type { RunEvent } from '../../api/run-events.js';
import { toolText } from './tool-text.js';

// RF-1002: the short text of an event in the verbose log, for example `Catalog read_file
// Catalog/Edit.aspx.cs:40-80`. Every value comes from the event and is shown as text; a long one is
// cut. A type the page does not know shows its data, cut.

const MAX_TEXT = 200;

const cut = (value: string): string =>
  value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}...` : value;

function field(data: Readonly<Record<string, unknown>>, key: string): string {
  const value = data[key];
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

function argsOf(data: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const args = data['args'];
  return typeof args === 'object' && args !== null ? Object.fromEntries(Object.entries(args)) : {};
}

type Writer = (data: Readonly<Record<string, unknown>>, area: string) => string;

const writers: Readonly<Record<string, Writer>> = {
  'run.started': (data) => `${field(data, 'stage')} run`,
  'source.resolved': (data) => `${field(data, 'url')} @ ${field(data, 'commitSha').slice(0, 7)}`,
  'source.downloaded': (data) => `${field(data, 'fileCount')} files`,
  'scan.completed': (data) => `${field(data, 'files')} files, ${field(data, 'areas')} areas`,
  'agent.planned': (data, area) => `${area} ${field(data, 'role')} ${field(data, 'model')}`,
  'agent.started': (data, area) => `${area} ${field(data, 'role')} ${field(data, 'model')}`,
  'agent.turn': (data, area) =>
    `${area} turn ${field(data, 'turn')} · ${field(data, 'inputTokens')} in / ${field(data, 'outputTokens')} out`,
  'agent.tool.called': (data, area) => `${area} ${toolText(field(data, 'tool'), argsOf(data))}`,
  'agent.tool.result': (data, area) =>
    `${area} ${field(data, 'tool')} ${data['ok'] === true ? 'ok' : `failed ${field(data, 'refusedReason')}`}`,
  'agent.card.proposed': (data, area) =>
    `${area} ${field(data, 'cardId')} "${field(data, 'title')}"`,
  'agent.ended': (data, area) =>
    `${area} ${field(data, 'state')} · ${field(data, 'turns')} turns, ${field(data, 'cards')} cards`,
  'verify.citation.checked': (data) =>
    `${field(data, 'claimId')} ${data['ok'] === true ? 'ok' : `citation invalid · ${field(data, 'reason')}`}`,
  'verify.judgement.started': (data) => `${field(data, 'claims')} claims to judge`,
  'verify.claim.judged': (data) =>
    `${field(data, 'claimId')} ${field(data, 'status')} · ${field(data, 'reason')}`,
  'verify.judgement.ended': (data) =>
    `${field(data, 'supported')} supported, ${field(data, 'rejected')} rejected, ${field(data, 'unverified')} unverified, ${field(data, 'notJudged')} not judged`,
  'usage.recorded': (data) => `${field(data, 'role')} ${field(data, 'costMicros')} micro-dollars`,
  'budget.warning': (data) =>
    `${field(data, 'scope')} at ${field(data, 'sharePercent')}% of its cap`,
  'budget.capReached': (data) => `${field(data, 'role')} ${field(data, 'scope')} reached its cap`,
  'run.ended': (data) =>
    `${field(data, 'endState')}${data['errorCode'] === undefined ? '' : ` · ${field(data, 'errorCode')}`}`,
};

// RF-1002
export function logText(event: RunEvent, area: string): string {
  const write = Object.hasOwn(writers, event.type) ? writers[event.type] : undefined;
  const text = write === undefined ? JSON.stringify(event.data) : write(event.data, area);
  return cut(text.trim());
}
