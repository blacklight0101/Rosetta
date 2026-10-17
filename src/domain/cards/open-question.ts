// RF-243, DEC-136: an open question asks about something the code cannot tell (business intent, the
// reason for a rule, an external system, data volumes, who uses a feature). A question that asks
// what the code, an area or the application does is the agent's own reading left undone, so it is
// refused and the agent is sent back to read. The rule is a deliberate heuristic on the wording: it
// refuses the usual shapes of such a question, and leaves a question it is unsure about to the user.

/** What a refusal tells the agent (the repair request shows it with the problem's path). */
export const codeQuestionRefusal =
  'This question asks what the code, an area or the application does. Do not ask it: read the code and describe what it shows in a FEAT, BR, ENT or INT card. Ask an OQ question only about something outside the code: business intent, the reason for a rule, an external system, data volumes or who uses a feature.';

/** Things a question may be about when it is about the code itself. */
const codeNouns =
  'area|areas|application|app|system|code|codebase|module|modules|file|files|class|classes|component|components|service|services|page|pages|project|repository|repo|program|software|function|method|folder|directory|package|library|screen|screens|controller|controllers';
const subject = String.raw`(?:(?:the|this|these|that|those|our)\s+)?(?:[a-z0-9_.-]+\s+){0,2}(?:${codeNouns})`;

const refusedShapes: readonly RegExp[] = [
  // "What does this area do?", "What does the orders module do?"
  new RegExp(String.raw`^(?:what|which)\s+(?:does|do|did)\s+${subject}\s+do$`, 'u'),
  // "What is the purpose of the application?", "What is the role of the Catalog area?"
  new RegExp(
    String.raw`^what\s+(?:is|are)\s+the\s+(?:purpose|goal|aim|role|function|responsibility|responsibilities|scope)\s+of\s+${subject}$`,
    'u',
  ),
  // "What is the business logic of X?", "What is the logic of the Orders module?"
  /^what\s+(?:is|are)\s+the\s+(?:business\s+)?(?:logic|functionality|behaviou?r)\s+of\s+/u,
  // "What is this application for?", "What is the orders area about?"
  new RegExp(String.raw`^what\s+(?:is|are)\s+${subject}\s+(?:for|about|used\s+for)$`, 'u'),
  // "How does the checkout code work?"
  /^how\s+(?:does|do)\s+.{1,80}?\s+work$/u,
  // "Explain what this application does", "Describe the orders area"
  /^(?:please\s+)?(?:explain|describe|summari[sz]e)\b/u,
  /^(?:can|could|would)\s+you\s+(?:please\s+)?(?:explain|describe|summari[sz]e|tell\s+me\s+what)\b/u,
];

/** Lower case, letters and digits only, single spaces: "What does THIS area do?" -> "what does this area do". */
function wordsOf(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// RF-243
export function asksWhatCodeDoes(question: string): boolean {
  const words = wordsOf(question);
  return refusedShapes.some((shape) => shape.test(words));
}
