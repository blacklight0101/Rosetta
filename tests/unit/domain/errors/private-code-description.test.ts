import { expect, it } from 'vitest';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';

// P8-98, EV-86: RST-1521 is answered by the start of a run, the Deepen start and the options call
// of Plan setup, and with a stored consent the box is not shown, so the next step names the
// project's confirmation instead of the start of a run.

it('RF-132 RST-1521 says where to confirm: the project, then try again', () => {
  const { nextStep } = describeError(ERROR_CODES.privateCodeNotConfirmed);

  expect(nextStep).toBe('Give the private code confirmation for this project, then try again.');
});

it('RF-132 RST-1521 no longer sends the user to start the run again', () => {
  const { nextStep } = describeError(ERROR_CODES.privateCodeNotConfirmed);

  expect(nextStep).not.toMatch(/start the run again/i);
});
