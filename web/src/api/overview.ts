import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';

// RF-264, overview-routes.ts: the overview of an understand run, read from the run's `overview.json`.
// Every text in it comes from a model or a repository, so the page shows it as text (RF-507).

const sectionIds = ['application', 'users', 'features', 'screens', 'data', 'integrations'] as const;

const statementSchema = z.looseObject({
  text: z.string(),
  cards: z.array(z.looseObject({ id: z.string(), type: z.string() })),
});

const overviewSchema = z.looseObject({
  state: z.enum(['full', 'thin', 'unavailable']),
  notice: z.string().optional(),
  sections: z.array(
    z.looseObject({ id: z.enum(sectionIds), statements: z.array(statementSchema) }),
  ),
  notCovered: z.array(z.string()),
  questions: z.array(z.looseObject({ cardId: z.string(), section: z.enum(sectionIds) })),
});

const bodySchema = z
  .looseObject({ overview: overviewSchema.nullable() })
  .transform((body) => body.overview);

export type RunOverviewData = z.output<typeof overviewSchema>;
export type OverviewSectionId = (typeof sectionIds)[number];

/** The titles of the sections, as the specification names them. */
export const sectionTitles: Readonly<Record<OverviewSectionId, string>> = {
  application: 'What the application is',
  users: 'Who uses it',
  features: 'Main features',
  screens: 'Screens',
  data: 'Data',
  integrations: 'Integrations',
};

// RF-264
export function getOverview(
  client: ApiClient,
  runId: string,
  signal: AbortSignal,
): Promise<ApiResult<RunOverviewData | null>> {
  return client.request({
    method: 'GET',
    path: `/api/runs/${encodeURIComponent(runId)}/overview`,
    schema: bodySchema,
    signal,
  });
}

/** The address of a card file of the run, served as text by the run file route. */
export function cardFilePath(runId: string, card: { id: string; type: string }): string {
  const folder = encodeURIComponent(card.type);
  return `/runs/${encodeURIComponent(runId)}/files/cards/${folder}/${encodeURIComponent(card.id)}.md`;
}
