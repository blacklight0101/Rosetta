import { describe, expect, it } from 'vitest';
import {
  REPORT_CSP,
  REPORT_REFERRER,
} from '../../../../src/infrastructure/report/report-security.js';
import { fallbackSecurityHeaders } from '../../../../src/presentation/web/security-headers.js';

// RF-1013: the static report carries an equivalent content security policy in a meta element and
// the referrer policy no-referrer.

describe('the report page policy', () => {
  it('RF-1013 is the policy of the server without frame-ancestors, which a meta element ignores', () => {
    const header = fallbackSecurityHeaders('http://127.0.0.1:8080')['Content-Security-Policy'];

    expect(REPORT_CSP).toBe((header ?? '').replace("; frame-ancestors 'none'", ''));
    expect(REPORT_CSP).toContain("default-src 'self'");
    expect(REPORT_CSP).toContain("style-src 'self'");
    expect(REPORT_CSP).not.toContain('frame-ancestors');
    expect(REPORT_CSP).not.toContain('unsafe');
  });

  it('RF-1013 sends no referrer', () => {
    expect(REPORT_REFERRER).toBe('no-referrer');
  });
});
