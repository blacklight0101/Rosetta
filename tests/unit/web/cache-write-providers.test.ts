import { expect, it } from 'vitest';
import { cacheWriteKinds } from '../../../src/domain/budget/price-table.js';
import { cacheWriteProviders } from '../../../web/src/pages/provider-choices.js';

// RF-427, P2-37: the settings page warns for the providers whose price needs a cache-write price.
// The web build cannot import the domain, so the page keeps one list of its own; this test fails
// when it drifts from the domain list the price lookup uses.

it('RF-427 the page lists the provider kinds the price lookup needs a cache-write price for', () => {
  expect([...cacheWriteProviders].sort()).toEqual([...cacheWriteKinds].sort());
});
