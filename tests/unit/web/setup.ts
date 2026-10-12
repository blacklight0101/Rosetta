import { cleanup } from '@testing-library/preact';
import { afterEach } from 'vitest';

// Vitest setup for the `web` project: unmount what a test rendered, because Testing Library only
// cleans up by itself when the test globals are on.
afterEach(() => {
  cleanup();
});
