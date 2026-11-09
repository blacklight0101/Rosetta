import type { EndReason } from '../api/end-reason.js';

// P8-111, DEC-217: the words of a run that ended `Interrupted`, by why it ended. "Stopped by you" is
// only for a Stop of its owner and for a run with no recorded reason (it keeps the wording it had).

const words: Readonly<Record<EndReason, string>> = {
  UserStop: 'Stopped by you',
  Restart: 'Stopped by a restart',
  QueueCancel: 'Cancelled while queued',
};

export function interruptedWord(reason: EndReason | null | undefined): string {
  return words[reason ?? 'UserStop'];
}

/** The word in a sentence: "stopped by you", for a run title or a heading. */
export function interruptedPhrase(reason: EndReason | null | undefined): string {
  return interruptedWord(reason).toLowerCase();
}
