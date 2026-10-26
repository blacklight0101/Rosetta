import { within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { callsBody, callsPath, cloud } from './api-calls-fixtures.js';
import { callsPanel, loaded, renderCalls } from './api-calls-helpers.js';
import { json } from './fake-api.js';

// RF-507, RF-1011 (P5-21): a call's error text comes from the provider and is shown as text. Markup in
// it is typed out, and no element is formed from it on the calls page.

const hostile = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>'];

describe('the error message of a call is shown as text', () => {
  it.each(hostile)('RF-507 RF-1011 shows %s as typed, with no element formed', async (message) => {
    const failed = cloud(1, {
      status: 'failed',
      errorCode: 'RST-1505',
      errorMessage: message,
      hasTranscript: false,
    });
    renderCalls({ [`GET ${callsPath}`]: json(200, callsBody({}, [failed])) });
    await loaded();

    const shown = within(callsPanel()).getByTestId('call-error-message');
    expect(shown.textContent).toBe(message);
    expect(shown.children).toHaveLength(0);
    expect(callsPanel().querySelector('script, img')).toBeNull();
  });
});
