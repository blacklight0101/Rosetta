import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';

// P5-19 item 2 (follow-up of P3-116): a short value under an api-key name outside an XML attribute
// is masked like a short token or secret. FAKE values only (RNF-003).

const masker = new SecretMasker();
const fake = 'k9x2';
const mask = '[MASKED:api-key]';

describe('short values under api-key names (P5-19)', () => {
  it.each([
    [`api_key=${fake}\nPORT=25`, `api_key=${mask}\nPORT=25`],
    [`API_KEY: ${fake}`, `API_KEY: ${mask}`],
    [`{"apiKey":"${fake}"}`, `{"apiKey":"${mask}"}`],
    [`ApiKey = ${fake}`, `ApiKey = ${mask}`],
    [`mail:\n  api-key: ${fake}\n  port: 25`, `mail:\n  api-key: ${mask}\n  port: 25`],
    [`vendor_api_key=${fake}`, `vendor_api_key=${mask}`],
  ])('masks %j', (text, masked) => {
    const result = masker.mask(text);

    expect(result.text).toBe(masked);
    expect(result.counts['api-key']).toBe(1);
  });

  it.each([
    'api_key=true',
    'api_key=30',
    'api_key=',
    'capi_key=k9x2',
    'api_keyboard=k9x2',
    'api_key=string',
    'api_key=<your-key>',
  ])('leaves %j alone', (text) => {
    expect(masker.mask(text).text).toBe(text);
  });
});
