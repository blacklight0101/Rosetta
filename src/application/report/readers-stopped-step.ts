import { z } from 'zod';

// RF-429, RF-506, P5-20: the replay step of `budget.readersStopped`. Data that does not fit its
// event gives no step.

const data = z.object({ reason: z.string(), claimsWaiting: z.number().int().min(0) });

/** The step of `budget.readersStopped`: why the readers stopped, in the words of the run page. */
export function readersStoppedStep(
  value: Record<string, unknown>,
): { readonly kind: 'budget'; readonly label: string; readonly text: string } | undefined {
  const parsed = data.safeParse(value);
  if (!parsed.success) return undefined;
  const { reason, claimsWaiting } = parsed.data;
  const text =
    reason === 'share'
      ? 'Readers stopped: the run cap, less the part kept for the summary, or the reader cap is used up.'
      : `Readers stopped to leave room to judge the ${String(claimsWaiting)} claims written.`;
  return { kind: 'budget', label: 'Readers stopped', text };
}
