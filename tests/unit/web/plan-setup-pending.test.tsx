import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { planOptions, savedBrief, startedPlanRun } from './plan-setup-fixtures.js';
import { base, ready, renderPlan } from './plan-setup-helpers.js';

// RF-608, RF-609, RF-604, RNF-010: what the options say is text, never markup, and a request in
// flight cannot be sent twice from the page.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const hostile = '<img src=x onerror="window.pwned = 1">';
const gate = () => {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
};
const postsTo = (page: ReturnType<typeof renderPlan>, path: string): number =>
  page.calls.filter((call) => call.method === 'POST' && call.path === path).length;

describe('options with markup in their text', () => {
  it('RF-608 RF-609 shows an option made of markup as text and runs nothing', async () => {
    const hostileOptions = {
      architecture: {
        ...planOptions.architecture,
        options: planOptions.architecture.options.map((option) => ({
          ...option,
          strengths: [hostile],
        })),
      },
      stack: planOptions.stack.map((layer) => ({ ...layer, options: [hostile, 'other'] })),
    };
    const { container } = renderPlan({ [`POST ${base}/plan-options`]: json(200, hostileOptions) });
    await ready();

    fireEvent.click(screen.getByRole('button', { name: 'Architecture' }));
    expect((await screen.findAllByText(hostile)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Stack' }));
    expect((await screen.findAllByText(hostile)).length).toBeGreaterThan(0);

    expect(container.querySelector('img')).toBeNull();
    expect('pwned' in window).toBe(false);
  });
});

describe('a request in flight', () => {
  it('RF-604 disables "Write the package" until the answer and starts one run only', async () => {
    const release = gate();
    const page = renderPlan({
      [`GET ${base}/planning-brief`]: json(200, savedBrief),
      [`POST ${base}/runs`]: async () => {
        await release.opened;
        return json(202, startedPlanRun);
      },
    });
    await ready();
    const button = screen.getByRole('button', { name: /^Write the package/u });

    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toHaveProperty('disabled', true);
    });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(postsTo(page, `${base}/runs`)).toBe(1);
    release.open();
  });

  it('RF-608 asks again once, however often "Ask again" is pressed, and offers no second press', async () => {
    const release = gate();
    let calls = 0;
    const page = renderPlan({
      [`POST ${base}/plan-options`]: async () => {
        calls += 1;
        if (calls === 1) return new Response(null, { status: 502 });
        await release.opened;
        return json(200, planOptions);
      },
    });
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Architecture' }));
    const again = await screen.findByRole('button', { name: 'Ask again' });

    fireEvent.click(again);
    fireEvent.click(again);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull();
    });
    expect(postsTo(page, `${base}/plan-options`)).toBe(2);
    release.open();
  });
});
