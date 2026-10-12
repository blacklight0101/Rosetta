import type { ApiClient, ApiResult } from './client.js';
import {
  auditSchema,
  capsAnswerSchema,
  capsViewSchema,
  defaultRolesAnswerSchema,
  userAnswerSchema,
  userListSchema,
  workspaceSchema,
  type Account,
  type AuditPage,
  type Caps,
  type CapsView,
  type DefaultRoles,
  type ListedAccount,
  type Workspace,
} from './admin-schemas.js';

// RF-1102, RF-1105, RF-1106, RF-1109, DEC-106: the administration calls. The server refuses every
// one of them with 403 for a user; the pages only ever call them after the session says admin.

export interface NewAccount {
  readonly userName: string;
  readonly displayName: string;
  readonly role: 'admin' | 'user';
  readonly password: string;
  readonly mustChangePassword: boolean;
}

export interface AuditQuery {
  readonly userId: string;
  readonly action: string;
}

// RF-1102
export async function listUsers(
  client: ApiClient,
  signal: AbortSignal,
): Promise<ApiResult<readonly ListedAccount[]>> {
  const result = await client.request({
    method: 'GET',
    path: '/api/admin/users',
    schema: userListSchema,
    signal,
  });
  return result.ok ? { ok: true, value: result.value.users } : result;
}

// RF-1102
export async function createUser(client: ApiClient, body: NewAccount): Promise<ApiResult<Account>> {
  const result = await client.request({
    method: 'POST',
    path: '/api/admin/users',
    body,
    schema: userAnswerSchema,
  });
  return result.ok ? { ok: true, value: result.value.user } : result;
}

// RF-1102
export async function changeUser(
  client: ApiClient,
  userId: string,
  change: 'disable' | 'enable',
): Promise<ApiResult<Account>> {
  const result = await client.request({
    method: 'POST',
    path: `/api/admin/users/${encodeURIComponent(userId)}/${change}`,
    schema: userAnswerSchema,
  });
  return result.ok ? { ok: true, value: result.value.user } : result;
}

// RF-1102
export async function resetPassword(
  client: ApiClient,
  userId: string,
  password: string,
): Promise<ApiResult<Account>> {
  const result = await client.request({
    method: 'POST',
    path: `/api/admin/users/${encodeURIComponent(userId)}/password`,
    body: { password },
    schema: userAnswerSchema,
  });
  return result.ok ? { ok: true, value: result.value.user } : result;
}

// RF-1105
export function openWorkspace(
  client: ApiClient,
  userId: string,
  signal: AbortSignal,
): Promise<ApiResult<Workspace>> {
  return client.request({
    method: 'GET',
    path: `/api/admin/users/${encodeURIComponent(userId)}/projects`,
    schema: workspaceSchema,
    signal,
  });
}

// RF-1106
export function getCaps(client: ApiClient, signal: AbortSignal): Promise<ApiResult<CapsView>> {
  return client.request({
    method: 'GET',
    path: '/api/admin/caps',
    schema: capsViewSchema,
    signal,
  });
}

// RF-1106
export async function saveCaps(client: ApiClient, caps: Caps): Promise<ApiResult<Caps>> {
  const result = await client.request({
    method: 'PUT',
    path: '/api/admin/caps',
    body: caps,
    schema: capsAnswerSchema,
  });
  return result.ok ? { ok: true, value: result.value.caps } : result;
}

/** The last 30 days, newest first; an empty `userId` or `action` leaves that filter out. */
// RF-1109
export function listAudit(
  client: ApiClient,
  query: AuditQuery,
  signal: AbortSignal,
): Promise<ApiResult<AuditPage>> {
  const params = new URLSearchParams();
  if (query.userId !== '') params.set('userId', query.userId);
  if (query.action !== '') params.set('action', query.action);
  const text = params.toString();
  return client.request({
    method: 'GET',
    path: text === '' ? '/api/admin/audit' : `/api/admin/audit?${text}`,
    schema: auditSchema,
    signal,
  });
}

// DEC-106
export async function getDefaultRoles(
  client: ApiClient,
  signal: AbortSignal,
): Promise<ApiResult<DefaultRoles>> {
  const result = await client.request({
    method: 'GET',
    path: '/api/admin/default-roles',
    schema: defaultRolesAnswerSchema,
    signal,
  });
  return result.ok ? { ok: true, value: result.value.roles } : result;
}

// DEC-106
export async function saveDefaultRoles(
  client: ApiClient,
  roles: DefaultRoles,
): Promise<ApiResult<DefaultRoles>> {
  const result = await client.request({
    method: 'PUT',
    path: '/api/admin/default-roles',
    body: { roles },
    schema: defaultRolesAnswerSchema,
  });
  return result.ok ? { ok: true, value: result.value.roles } : result;
}
