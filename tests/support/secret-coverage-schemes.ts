// FAKE SECRETS ONLY (RNF-003). P2-43 (RF-141): Authorization schemes, URL credentials, XML settings
// and the P2-40 identifier skips.

import type { CoverageCase } from './secret-coverage-values.js';
import {
  token,
  shortToken,
  secret,
  password,
  hex,
  basic,
  dashed,
  apiKeyName,
  f,
  one,
} from './secret-coverage-values.js';

const schemeCases: readonly CoverageCase[] = [
  one(
    'curl -u user:pass',
    'password',
    [
      `curl -u admin:${password} https://x.example/api`,
      'curl -u admin:[MASKED:password] https://x.example/api',
    ],
    password,
  ),
  one(
    'curl --user after other flags',
    'password',
    [
      `curl -s -X POST ${dashed('user')} admin:${password} https://x.example`,
      `curl -s -X POST ${dashed('user')} admin:[MASKED:password] https://x.example`,
    ],
    password,
  ),
  one(
    'an Authorization Digest response',
    'bearer-token',
    [
      `Authorization: Digest username="u", response="${hex}", qop=auth`,
      'Authorization: Digest username="u", response="[MASKED:bearer-token]", qop=auth',
    ],
    hex,
  ),
  one(
    'an Authorization ApiKey value',
    'bearer-token',
    [`Authorization: ApiKey ${token}`, 'Authorization: ApiKey [MASKED:bearer-token]'],
    token,
  ),
  one(
    'a bare Authorization value',
    'bearer-token',
    [`Authorization: ${token}`, 'Authorization: [MASKED:bearer-token]'],
    token,
  ),
  one(
    'a Basic value without a header name',
    'bearer-token',
    [`proxy sent Basic ${basic} upstream`, 'proxy sent Basic [MASKED:bearer-token] upstream'],
    basic,
  ),
  one(
    'a short Bearer value',
    'bearer-token',
    [`curl -H "Bearer ${shortToken}"`, 'curl -H "Bearer [MASKED:bearer-token]"'],
    shortToken,
  ),
  one(
    'a 19-character Bearer value',
    'bearer-token',
    [`use Bearer ${f(19)} here`, 'use Bearer [MASKED:bearer-token] here'],
    f(19),
  ),
  one(
    'a Set-Cookie session value',
    'bearer-token',
    [
      `Set-Cookie: connect.sid=${token}; Path=/; HttpOnly`,
      'Set-Cookie: connect.sid=[MASKED:bearer-token]; Path=/; HttpOnly',
    ],
    token,
  ),
  one(
    'a URL password that contains /',
    'connection-string',
    [
      `postgres://app:${password}/${secret}@db:5432/x`,
      'postgres://app:[MASKED:connection-string]@db:5432/x',
    ],
    password,
    secret,
  ),
  one(
    'a URL user token with no colon',
    'connection-string',
    [
      `git clone https://${token}@github.example/o/r.git`,
      'git clone https://[MASKED:connection-string]@github.example/o/r.git',
    ],
    token,
  ),
  one(
    'an XML appSettings password',
    'password',
    [
      `<add key="Password" value="${password}" />`,
      '<add key="Password" value="[MASKED:password]" />',
    ],
    password,
  ),
  one(
    'an XML appSettings API key',
    'password',
    [
      `<add key="Vendor.ApiKey" value="${token}"/>`,
      '<add key="Vendor.ApiKey" value="[MASKED:password]"/>',
    ],
    token,
  ),
];

/** P2-40 follow-up: the skips that were too wide. */
const identifierCases: readonly CoverageCase[] = [
  one(
    'a lower-case snake case api_key value',
    'api-key',
    [`${apiKeyName}=fake_value_here_ok`, `${apiKeyName}=[MASKED:api-key]`],
    'fake_value_here_ok',
  ),
  one(
    'a dotted api_key value of an unknown root',
    'api-key',
    [`${apiKeyName}=client.fakevalue0`, `${apiKeyName}=[MASKED:api-key]`],
    'fakevalue0',
  ),
];

export const schemeCoverageCases: readonly CoverageCase[] = [...schemeCases, ...identifierCases];
