import type { SourceCard } from './plan-sources.js';

// RF-626, Q-27, DEC-134: the user-interface material of the hand-off package. The draft is what
// the planner answers (untrusted model output, ADR-013); the target screens are what is written
// once `assembleUx` has checked it against the verified `SCRN` cards. Every legacy screen ends
// up kept, merged into another screen or dropped, each with a reason. What a wireframe lists
// (fields, actions, navigation) comes from the legacy cards the screen replaces, never from the
// model; the model only names a target screen, says why and writes the design brief.

/** Q-27: the most target screens that get a wireframe; the rest are dropped with their reason. */
export const MAX_SCREENS = 20;

type ScreenDisposition = 'kept' | 'merged' | 'dropped';

interface DraftScreen {
  /** The name of the target screen. */
  readonly name: string;
  /** What the screen is for, in one sentence. */
  readonly purpose: string;
  /** Why the legacy screens are kept (one card) or merged (several). */
  readonly reason: string;
  /** The `SCRN` card ids of the legacy screens it replaces. */
  readonly cards: readonly string[];
}

interface DraftDropped {
  readonly card: string;
  readonly reason: string;
}

export interface DesignBriefContent {
  /** Who uses the interface; empty when the planner said nothing. */
  readonly audience: string;
  /** The tone of the interface; empty when the planner said nothing. */
  readonly tone: string;
  /** The interface components the design tool needs, in the planner's order. */
  readonly components: readonly string[];
}

export interface UxDraft {
  readonly screens: readonly DraftScreen[];
  readonly dropped: readonly DraftDropped[];
  readonly designBrief: DesignBriefContent;
}

export interface WireframeField {
  readonly name: string;
  readonly inputKind: string;
  readonly required: boolean;
}

export interface WireframeAction {
  readonly label: string;
  /** The handler the action calls, when the legacy card names one. */
  readonly handler: string | null;
  /** The `FLOW` card the action starts, when the legacy card names one. */
  readonly flow: string | null;
}

/** Where a screen leads; `screenId` is set when it leads to a target screen with a wireframe. */
export interface NavigationLink {
  readonly label: string;
  readonly screenId: string | null;
}

export interface TargetScreen {
  /** The first legacy card id of the screen; it names the wireframe file. */
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly reason: string;
  /** The legacy `SCRN` card ids it replaces, in id order. */
  readonly cards: readonly string[];
  readonly roles: readonly string[];
  readonly fields: readonly WireframeField[];
  readonly actions: readonly WireframeAction[];
  readonly navigation: readonly NavigationLink[];
}

export interface LegacyScreen {
  readonly cardId: string;
  readonly title: string;
  readonly route: string;
  readonly disposition: ScreenDisposition;
  readonly reason: string;
  /** The target screen that replaces it; null when dropped. */
  readonly target: string | null;
}

export interface TargetUx {
  readonly screens: readonly TargetScreen[];
  /** Every verified `SCRN` card, in card order, kept, merged or dropped. */
  readonly legacy: readonly LegacyScreen[];
  readonly designBrief: DesignBriefContent;
}

/** How many items of the draft the checks refused, for the log. */
export interface UxLeftOut {
  /** Screens naming no usable card, and card ids that are no verified screen or are placed twice. */
  readonly screens: number;
  readonly cards: number;
}

export interface UxAssembly {
  readonly ux: TargetUx;
  readonly leftOut: UxLeftOut;
}

export const noDesignBrief: DesignBriefContent = { audience: '', tone: '', components: [] };

export const noUx: TargetUx = { screens: [], legacy: [], designBrief: noDesignBrief };

/** The verified `SCRN` cards: those with at least one supported claim, in card order. */
// RF-626
export function screenCardsOf(cards: readonly SourceCard[]): SourceCard[] {
  return cards.filter(
    (card) => card.type === 'SCRN' && card.claims.some((claim) => claim.status === 'Supported'),
  );
}
