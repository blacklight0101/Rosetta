import type { Page } from '@playwright/test';
import { z } from 'zod';

// RF-1018, P1-172: the real estimate answer of the test server with its areas replaced, so the start
// page can be driven with 1 or 120 areas, long names and library areas. A POST names the areas it
// wants, and only those come back, as the server does.

export interface FakeArea {
  readonly name: string;
  readonly files: number;
  readonly thirdParty: boolean;
}

const estimateBody = z.looseObject({ areas: z.array(z.unknown()) });
const named = z.object({ areas: z.array(z.string()) });

export function ownAreas(count: number, nameOf: (index: number) => string): readonly FakeArea[] {
  return Array.from({ length: count }, (_, index) => ({
    name: nameOf(index),
    files: 3,
    thirdParty: false,
  }));
}

export function libraryAreas(count: number): readonly FakeArea[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Scripts#${String(index + 1)}`,
    files: 7,
    thirdParty: true,
  }));
}

export async function fakeAreas(page: Page, areas: readonly FakeArea[]): Promise<void> {
  await page.route('**/api/projects/*/estimate', async (route) => {
    const response = await route.fetch({ method: 'GET', postData: '' });
    const body = estimateBody.parse(await response.json());
    const wanted = named.safeParse(route.request().postDataJSON());
    const chosen = wanted.success
      ? areas.filter((area) => wanted.data.areas.includes(area.name))
      : areas;
    const listed = chosen.map((area) => ({ ...area, estimatedTokens: 1000 }));
    await route.fulfill({ response, json: { ...body, areas: listed } });
  });
}

const metrics = z.object({ scrollHeight: z.number(), clientHeight: z.number() });

/** The scroll height and the visible height of the scrolling panel of the area list. */
export async function panelMetrics(page: Page): Promise<z.output<typeof metrics>> {
  const read: unknown = await page.evaluate(`(() => {
    const panel = document.querySelector('.rst-start__area-list');
    return { scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight };
  })()`);
  return metrics.parse(read);
}

/** Scrolls the panel of the area list to its end, and the page to its end. */
export async function scrollToEnds(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const panel = document.querySelector('.rst-start__area-list');
    panel.scrollTop = panel.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  })()`);
}
