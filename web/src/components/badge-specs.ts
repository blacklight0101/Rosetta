import type { GlyphName } from './Glyph.js';

// design-system.md section 6 and architecture.md section 5: the presentation of every value of
// every state list. The values are canonical in the architecture document (a test compares them);
// this file adds only tone, weight (loud = solid for states that need a person, calm = tint),
// glyph and the word. Colour never carries the meaning alone: every status has glyph and word.

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'brand';
type Weight = 'tint' | 'solid';

export interface BadgeSpec {
  readonly label: string;
  readonly tone: Tone;
  readonly weight: Weight;
  /** Absent only for classifications (role, card type, ...), which are words, not statuses. */
  readonly glyph?: GlyphName;
}

const badge = (label: string, tone: Tone, weight: Weight, glyph?: GlyphName): BadgeSpec =>
  glyph === undefined ? { label, tone, weight } : { label, tone, weight, glyph };
const tag = (label: string, tone: Tone = 'neutral'): BadgeSpec => badge(label, tone, 'tint');

/** Every state list with its values, in the order of architecture.md section 5. */
export const stateLists = {
  ClaimStatus: ['Proposed', 'CitationInvalid', 'Supported', 'Rejected', 'Unverified'],
  CardType: ['FEAT', 'BR', 'ENT', 'INT', 'OQ', 'FLOW', 'SCRN'],
  OpenQuestionState: ['Open', 'Answered'],
  /** DEC-154: how a question is shown; not a domain state list, so not in architecture.md. */
  QuestionShown: ['Open', 'Answer saved', 'Answered'],
  AgentTaskState: [
    'Planned',
    'Running',
    'Done',
    'TurnLimitReached',
    'InvalidOutput',
    'Failed',
    'StoppedByCap',
  ],
  RunEndState: ['Completed', 'CapReached', 'Failed', 'Interrupted'],
  RunQueueState: ['Queued', 'Running', 'Ended'],
  Role: ['admin', 'user'],
  AccountState: ['Active', 'MustChangePassword', 'Locked', 'Disabled'],
  MapLevel: ['coarse', 'symbols'],
  Confidence: ['High', 'Medium', 'Low'],
  /** Provider call status (RF-408); not a domain state list, so not in architecture.md. */
  CallStatus: ['ok', 'retried', 'failed', 'refused-by-cap'],
} as const;

export type StateListName = keyof typeof stateLists;
export type StateValue<L extends StateListName> = (typeof stateLists)[L][number];

type SpecTable = { readonly [L in StateListName]: Readonly<Record<StateValue<L>, BadgeSpec>> };

export const badgeSpecs: SpecTable = {
  ClaimStatus: {
    Proposed: badge('Proposed', 'neutral', 'tint', 'open-circle'),
    CitationInvalid: badge('Citation invalid', 'danger', 'tint', 'broken-link'),
    Supported: badge('Supported', 'ok', 'solid', 'check'),
    Rejected: badge('Rejected', 'danger', 'solid', 'cross'),
    Unverified: badge('Unverified', 'warn', 'tint', 'question'),
  },
  CardType: {
    FEAT: tag('FEAT'),
    BR: tag('BR'),
    ENT: tag('ENT'),
    INT: tag('INT'),
    OQ: tag('OQ', 'warn'),
    FLOW: tag('FLOW'),
    SCRN: tag('SCRN'),
  },
  OpenQuestionState: {
    Open: badge('Open', 'warn', 'tint', 'question'),
    Answered: badge('Answered', 'ok', 'tint', 'check'),
  },
  QuestionShown: {
    Open: badge('Open', 'warn', 'tint', 'question'),
    'Answer saved': badge('Answer saved', 'info', 'tint', 'check'),
    Answered: badge('Answered', 'ok', 'tint', 'check'),
  },
  AgentTaskState: {
    Planned: badge('Planned', 'neutral', 'tint', 'dashed-circle'),
    Running: badge('Running', 'info', 'solid', 'live-dot'),
    Done: badge('Done', 'ok', 'tint', 'check'),
    TurnLimitReached: badge('Turn limit reached', 'warn', 'tint', 'clock'),
    InvalidOutput: badge('Invalid output', 'danger', 'tint', 'brackets'),
    Failed: badge('Failed', 'danger', 'solid', 'exclamation'),
    StoppedByCap: badge('Stopped by cap', 'warn', 'solid', 'square'),
  },
  RunEndState: {
    Completed: badge('Completed', 'ok', 'solid', 'check'),
    CapReached: badge('Cap reached', 'warn', 'solid', 'square'),
    Failed: badge('Failed', 'danger', 'solid', 'exclamation'),
    Interrupted: badge('Interrupted', 'neutral', 'solid', 'pause-bars'),
  },
  RunQueueState: {
    Queued: badge('Queued', 'info', 'tint', 'clock'),
    Running: badge('Running', 'info', 'solid', 'live-dot'),
    Ended: badge('Ended', 'neutral', 'tint', 'check'),
  },
  Role: { admin: tag('admin', 'brand'), user: tag('user') },
  AccountState: {
    Active: badge('Active', 'ok', 'tint', 'check'),
    MustChangePassword: badge('Must change password', 'warn', 'tint', 'question'),
    Locked: badge('Locked', 'danger', 'tint', 'exclamation'),
    Disabled: badge('Disabled', 'neutral', 'tint', 'cross'),
  },
  MapLevel: { coarse: tag('Coarse'), symbols: tag('Symbols') },
  Confidence: { High: tag('High', 'ok'), Medium: tag('Medium', 'warn'), Low: tag('Low', 'danger') },
  CallStatus: {
    ok: badge('Ok', 'ok', 'tint', 'check'),
    retried: badge('Retried', 'warn', 'tint', 'retry-arrow'),
    failed: badge('Failed', 'danger', 'solid', 'exclamation'),
    'refused-by-cap': badge('Refused by cap', 'warn', 'solid', 'square'),
  },
};
