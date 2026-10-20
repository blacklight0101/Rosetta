import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { RunNotice } from '../../../web/src/pages/RunNotice.js';

// RF-1108, RF-1001 (P3-68): the line after Start names the stage with the right article.

const started = (stage: string) =>
  render(
    <RunNotice
      notice={{ kind: 'started', stage, runId: 'r-1' }}
      busy={false}
      onCancel={() => undefined}
    />,
  );

it.each([
  ['understand', 'It is an understand run; it is running now.'],
  ['scan', 'It is a scan run; it is running now.'],
])('RF-1001 says "%s" with its article', (stage, text) => {
  started(stage);

  expect(screen.getByTestId('run-notice').textContent).toContain(text);
});
