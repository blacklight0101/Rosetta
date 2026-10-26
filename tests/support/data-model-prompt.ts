import { readFile } from 'node:fs/promises';

/** The shipped data-model prompt, as the call sends it. */
export function promptFixture(): Promise<string> {
  return readFile('prompts/planner/data-model.v4.md', 'utf8');
}
