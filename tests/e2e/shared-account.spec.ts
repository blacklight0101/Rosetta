import { expect, test } from './support/fixtures.js';
import { openStartPage } from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-010, RF-1105, P1-150: two pages of one account open the start page of the same repository at
// once, as two parallel tests of one account can. Both see the empty list and both try to create
// the project; the account ends with one project, and both pages reach its start page.

test('RF-010 two pages of one account that create the same project end with one project', async ({
  context,
}, info) => {
  await signInAs(context, accountFor('projects', info.project.name));
  const first = await context.newPage();
  const second = await context.newPage();

  await Promise.all([openStartPage(first), openStartPage(second)]);

  await first.goto('/projects');
  await expect(first.getByRole('link', { name: 'Start run for octo/webforms' })).toHaveCount(1);
});
