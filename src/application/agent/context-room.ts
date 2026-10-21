// Q-55: whether the conversation has room for the Q-50 refusal to be worth giving. A refusal costs
// one more read and one more answer; when they would not fit in the context share, the answer in
// hand is taken as it is instead of being lost to a context-limit end.

/** About four characters per token, the estimate the providers use too (RF-421). */
export const charsPerToken = 4;

/** What one more read adds to the conversation: a read of the default 400 lines. */
const readTokens = 4_000;

export function tokensOfText(text: string): number {
  return Math.ceil(text.length / charsPerToken);
}

/** Whether `free` tokens of the context share hold a new answer of the size of `answer` and a read. */
export function hasRoomForAnother(free: number, answer: string): boolean {
  return free >= tokensOfText(answer) + readTokens;
}
