import { cleanup, configure } from '@testing-library/preact';
import { afterEach } from 'vitest';

// Vitest setup for the `web` project: unmount what a test rendered, because Testing Library only
// cleans up by itself when the test globals are on.
afterEach(() => {
  cleanup();
});

// `waitFor` and `findBy*` give up after 1 s by default; a page that renders in 50 ms alone can take
// seconds when the machine is shared, so they wait up to 10 s and still fail on a real hang.
configure({ asyncUtilTimeout: 10_000 });

// A browser draws `<wbr>` inline, so it adds nothing to the accessible name of a link or a cell
// that holds a path. happy-dom has no such default and would put spaces around it.
const inlineWbr = document.createElement('style');
inlineWbr.textContent = 'wbr { display: inline; }';
document.head.append(inlineWbr);
