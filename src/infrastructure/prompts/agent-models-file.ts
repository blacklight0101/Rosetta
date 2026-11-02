import { parse } from 'yaml';
import { z } from 'zod';
import { holdsDataMarker } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { AgentModelMaps } from '../../domain/planning/build-method.js';

// P7-23, RF-639, RNF-004: `agent-models.v<n>.yaml` of the catalogue, the default model of each tier
// for Claude Code and for Codex. Anything that does not fit the shape below is refused with RST-1000
// rather than half read, so a build method never offers a broken name.

const name = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[^`|\p{Cc}\s]+$/u);

const tiers = z.strictObject({ smallest: name, middle: name, largest: name });

const fileSchema = z.strictObject({ 'claude-code': tiers, codex: tiers });

function invalid(file: string, problem: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.configurationInvalid,
    `The catalogue file ${file} ${problem}.`,
    {
      cause,
    },
  );
}

/** The default model names of Claude Code and Codex by tier, from `agent-models.v<n>.yaml` (RF-639). */
// RF-639, RNF-004
export function parseAgentModels(file: string, text: string): AgentModelMaps {
  if (holdsDataMarker(text)) throw invalid(file, 'holds a data block marker');
  let document: unknown;
  try {
    document = parse(text);
  } catch (error) {
    throw invalid(file, 'is not valid YAML', error);
  }
  const parsed = fileSchema.safeParse(document);
  if (!parsed.success) throw invalid(file, 'breaks its shape', parsed.error);
  return { claudeCode: parsed.data['claude-code'], codex: parsed.data.codex };
}
