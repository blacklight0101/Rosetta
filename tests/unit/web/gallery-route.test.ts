import { afterEach, describe, expect, it, vi } from 'vitest';

// DEC-126: the component gallery is served at /dev/gallery in development only. The router table
// adds the route only when import.meta.env.DEV is set, so a production build has no such route.

async function routePaths(): Promise<string[]> {
  const { routes } = await import('../../../web/src/app/routes.js');
  return routes.map((route) => route.path);
}

describe('DEC-126 component gallery route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('DEC-126 serves /dev/gallery in development', async () => {
    expect(await routePaths()).toContain('/dev/gallery');
  });

  it('DEC-126 has no /dev/gallery route in production', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();

    expect(await routePaths()).not.toContain('/dev/gallery');
  });
});
