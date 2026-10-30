import type { RunEvent } from '../../api/run-events.js';
import { toolText } from './tool-text.js';
import { capReachedText } from './cap-text.js';

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

/** ` · lines 1-317` for a read that says which lines it returned, else nothing. */
function servedText(data: Readonly<Record<string, unknown>>): string {
  const { startLine, endLine } = data;
  return typeof startLine === 'number' && typeof endLine === 'number'
    ? ` · lines ${String(startLine)}-${String(endLine)}`
    : '';
}

function seededOf(data: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const seeded = data['seeded'];
  return typeof seeded === 'object' && seeded !== null
    ? Object.fromEntries(Object.entries(seeded))
    : {};
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
    `${area} ${field(data, 'tool')} ${data['ok'] === true ? `ok${servedText(data)}` : `failed ${field(data, 'refusedReason')}`}`,
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
  'deepen.started': (data) => {
    const seeded = seededOf(data);
    return `from run ${field(data, 'parentRunKey')}: ${field(seeded, 'cards')} cards, ${field(seeded, 'claims')} claims · up to ${field(data, 'maxRounds')} rounds`;
  },
  'retry.started': (data) =>
    `retry of run ${field(data, 'parentRunKey')}: ${field(data, 'areas')} areas read again`,
  'deepen.round.started': (data) =>
    `round ${field(data, 'round')} of ${field(data, 'maxRounds')}: judge ${field(data, 'judge')}, re-read ${field(data, 'reread')}, ${field(data, 'unreadFiles')} unread files`,
  'deepen.round.ended': (data) =>
    `round ${field(data, 'round')} ${data['complete'] === false ? 'cut short' : 'ended'} · ${field(data, 'newClaims')} new claims, ${field(data, 'newSupported')} supported, ${field(data, 'filesRead')} files read`,
  'deepen.ended': (data) =>
    `stopped: ${field(data, 'stopReason')} after ${field(data, 'roundsDone')} rounds`,
  'budget.warning': (data) =>
    `${field(data, 'scope')} at ${field(data, 'sharePercent')}% of its cap`,
  'budget.capReached': (data) => capReachedText(data),
  'budget.readersStopped': (data) =>
    data['reason'] === 'share'
      ? 'Readers stopped: the run cap, less the part kept for the summary, or the reader cap is used up.'
      : `Readers stopped to leave room to judge the ${field(data, 'claimsWaiting')} claims written.`,
  'run.ended': (data) =>
    `${field(data, 'endState')}${data['errorCode'] === undefined ? '' : ` · ${field(data, 'errorCode')}`}`,
};

// RF-1002
export function logText(event: RunEvent, area: string): string {
  const write = Object.hasOwn(writers, event.type) ? writers[event.type] : undefined;
  const text = write === undefined ? JSON.stringify(event.data) : write(event.data, area);
  return cut(text.trim());
}
