import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';
import {
  keyAnswerSchema,
  keyListSchema,
  sessionSchema,
  type KeyProvider,
  type KeySummary,
  type Session,
} from './schemas.js';

// RF-1100, RF-1101, RF-1103, RF-1104: the account calls of the sign-in, change-password and
// settings pages. A sign-in and a password change answer a new CSRF token, which the client keeps
// for the requests that follow; a key never comes back from the server.

export interface Credentials {
  readonly userName: string;
  readonly password: string;
}

export interface NewPassword {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface KeyInput {
  readonly key: string;
  /** Only for an OpenAI-compatible key. */
  readonly baseUrl?: string;
}

function keepToken(client: ApiClient, result: ApiResult<Session>): ApiResult<Session> {
  if (result.ok) client.setCsrfToken(result.value.csrfToken);
  return result;
}

// RF-1100
export async function signIn(client: ApiClient, body: Credentials): Promise<ApiResult<Session>> {
  return keepToken(
    client,
    await client.request({ method: 'POST', path: '/api/session', body, schema: sessionSchema }),
  );
}

// RF-1101
export function signOut(client: ApiClient): Promise<ApiResult<undefined>> {
  return client.request({ method: 'DELETE', path: '/api/session', schema: z.undefined() });
}

// RF-1103
export async function changePassword(
  client: ApiClient,
  body: NewPassword,
): Promise<ApiResult<Session>> {
  return keepToken(
    client,
    await client.request({
      method: 'POST',
      path: '/api/account/password',
      body,
      schema: sessionSchema,
    }),
  );
}

// RF-1104
export async function listKeys(
  client: ApiClient,
  signal: AbortSignal,
): Promise<ApiResult<readonly KeySummary[]>> {
  const result = await client.request({
    method: 'GET',
    path: '/api/account/keys',
    schema: keyListSchema,
    signal,
  });
  return result.ok ? { ok: true, value: result.value.keys } : result;
}

// RF-1104
export async function saveKey(
  client: ApiClient,
  provider: KeyProvider,
  body: KeyInput,
): Promise<ApiResult<KeySummary>> {
  const result = await client.request({
    method: 'PUT',
    path: `/api/account/keys/${provider}`,
    body,
    schema: keyAnswerSchema,
  });
  return result.ok ? { ok: true, value: result.value.key } : result;
}

// RF-1104
export function deleteKey(client: ApiClient, provider: KeyProvider): Promise<ApiResult<undefined>> {
  return client.request({
    method: 'DELETE',
    path: `/api/account/keys/${provider}`,
    schema: z.undefined(),
  });
}
