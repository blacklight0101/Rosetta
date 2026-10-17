// FAKE SECRETS ONLY (RNF-003). P2-43 verifier findings (RF-141): curl with line continuations, the
// other Slack token types and case-insensitive signature keys.

import { dashed, f, hex, one, password, sig } from './secret-coverage-values.js';
import type { CoverageCase } from './secret-coverage-values.js';

const slackOf = (type: string): string => `${['xox', type].join('')}-${f(12)}-${f(24)}`;
const backslash = String.fromCharCode(92);
const backtick = String.fromCharCode(96);
const masked = '[MASKED:password]';
const user = `admin:${password}`;
const maskedUser = `admin:${masked}`;
const lf = `${backslash}\n  `;
const crlf = `${backslash}\r\n  `;
const tick = `${backtick}\n  `;

export const moreCoverageCases: readonly CoverageCase[] = [
  one(
    'curl -u after a backslash and LF continuation',
    'password',
    [
      `curl -X POST https://x.example ${lf}-u ${user} ${lf}-d x`,
      `curl -X POST https://x.example ${lf}-u ${maskedUser} ${lf}-d x`,
    ],
    password,
  ),
  one(
    'curl --user after a backslash and CRLF continuation',
    'password',
    [
      `curl https://x.example ${crlf}${dashed('user')} ${user}`,
      `curl https://x.example ${crlf}${dashed('user')} ${maskedUser}`,
    ],
    password,
  ),
  one(
    'curl -u after a backtick continuation',
    'password',
    [`curl https://x.example ${tick}-u ${user}`, `curl https://x.example ${tick}-u ${maskedUser}`],
    password,
  ),
  one(
    'curl -u with the user:password on the next line',
    'password',
    [`curl -u ${lf}${user} https://x.example`, `curl -u ${lf}${maskedUser} https://x.example`],
    password,
  ),
  one(
    'curl with combined short flags ending in u',
    'password',
    [`curl -sSu ${user} https://x.example`, `curl -sSu ${maskedUser} https://x.example`],
    password,
  ),
  one(
    'a Slack user token (xoxs-)',
    'api-key',
    [`post("${slackOf('s')}")`, 'post("[MASKED:api-key]")'],
    slackOf('s'),
  ),
  one(
    'a Slack refresh token (xoxr-)',
    'api-key',
    [`post("${slackOf('r')}")`, 'post("[MASKED:api-key]")'],
    slackOf('r'),
  ),
  one(
    'an upper-case SIG query key',
    'api-key',
    [`https://a.example/c?SIG=${sig}&x=1`, 'https://a.example/c?SIG=[MASKED:api-key]&x=1'],
    sig,
  ),
  one(
    'an AWS X-Amz-Signature query key',
    'api-key',
    [
      `https://a.example/c?a=1&X-Amz-Signature=${hex}&b=2`,
      'https://a.example/c?a=1&X-Amz-Signature=[MASKED:api-key]&b=2',
    ],
    hex,
  ),
];
