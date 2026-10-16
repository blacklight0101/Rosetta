import { json, type Answer } from './fake-api.js';
import { estimatePath, localEstimate } from './start-run-fixtures.js';

// RF-1018 (P1-172): estimates with many areas, some of them library code, and the fake answers of
// the estimate route: a GET answers for every area, a POST for the areas named in its body.

export interface AreaBody {
  readonly name: string;
  readonly estimatedTokens: number;
  readonly files: number;
  readonly thirdParty: boolean;
}

export const own = (name: string, files = 2): AreaBody => ({
  ...{ name, files },
  estimatedTokens: 1000,
  thirdParty: false,
});

export const library = (name: string, files = 4): AreaBody => ({
  ...{ name, files },
  estimatedTokens: 50_000,
  thirdParty: true,
});

function estimateWith(
  areas: readonly AreaBody[],
  base: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, areas };
}

function namesIn(body: unknown): readonly string[] {
  if (typeof body !== 'object' || body === null || !('areas' in body)) return [];
  const { areas } = body;
  return Array.isArray(areas) ? areas.filter((each) => typeof each === 'string') : [];
}

export function estimateAnswers(
  areas: readonly AreaBody[],
  base: Record<string, unknown> = localEstimate,
): Record<string, Answer> {
  return {
    [`GET ${estimatePath}`]: json(200, estimateWith(areas, base)),
    [`POST ${estimatePath}`]: (call) => {
      const named = namesIn(call.body);
      const chosen = areas.filter((area) => named.includes(area.name));
      return json(200, estimateWith(chosen, base));
    },
  };
}
