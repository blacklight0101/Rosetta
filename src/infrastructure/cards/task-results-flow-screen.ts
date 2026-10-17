import { z } from 'zod';
import type { SurfaceCoverage } from '../../domain/cards/area-coverage.js';
import type { Claim } from '../../domain/cards/card.js';
import type { FlowDetail, ScreenDetail } from '../../domain/cards/flow-screen.js';

// RF-006, RF-260, RF-261, RF-263, data-model 3.7a: the parts of `task-results.json` that only
// FLOW and SCRN cards and the flow and screen coverage carry, so a resumed run keeps a finished
// task as it was. Parsed at the boundary like the rest of the file; a missing key is absent.

const count = z.number().int().min(0);
const text = z.string();

const citation = z.object({ path: text, startLine: count, endLine: count });
const citedText = z.object({ text, citations: z.array(citation) });

/** What a FLOW step adds to its claim: the card it touches and its numbered, cited branches. */
export const stepShape = {
  target: text.optional(),
  branches: z.array(citedText.extend({ number: count })).optional(),
};

export const flowShape = z.object({ trigger: text, outcome: text });

export const screenShape = z.object({
  route: text,
  roles: z.array(text),
  fields: z.array(
    z.object({
      name: text,
      inputKind: text,
      required: z.boolean(),
      validations: z.array(citedText),
    }),
  ),
  actions: z.array(z.object({ label: text, handler: text.optional(), flow: text.optional() })),
  leadsTo: z.array(text),
});

export const surfaceShape = z.object({
  flowsMarked: z.boolean(),
  screensMarked: z.boolean(),
  flowCards: count,
  screenCards: count,
});

type StepFields = Pick<Claim, 'target' | 'branches'>;

/** The step fields of a stored claim, without the keys that are absent (exact optionals). */
export function stepOf(stored: {
  readonly target?: string | undefined;
  readonly branches?: Claim['branches'] | undefined;
}): StepFields {
  const { target, branches } = stored;
  return {
    ...(target === undefined ? {} : { target }),
    ...(branches === undefined ? {} : { branches }),
  };
}

/** The flow and screen detail of a stored card, without the keys that are absent. */
export function detailOf(stored: {
  readonly flow?: FlowDetail | undefined;
  readonly screen?: ScreenDetail | undefined;
}): { flow?: FlowDetail; screen?: ScreenDetail } {
  const { flow, screen } = stored;
  return {
    ...(flow === undefined ? {} : { flow }),
    ...(screen === undefined ? {} : { screen }),
  };
}

/** The flow and screen coverage of a stored area, absent for results from before they existed. */
export function surfaceOfStored(stored: SurfaceCoverage | undefined): {
  surface?: SurfaceCoverage;
} {
  return stored === undefined ? {} : { surface: stored };
}
