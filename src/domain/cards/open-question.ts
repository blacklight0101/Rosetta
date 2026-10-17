import { foldMarkers } from '../egress/marker-fold.js';

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
  // "What is this application for?", "What is this area responsible for?"
  new RegExp(
    String.raw`^what\s+(?:is|are)\s+${subject}\s+(?:for|about|used\s+for|responsible\s+for|supposed\s+to\s+do)$`,
    'u',
  ),
  // "How does the checkout code work?"
  /^how\s+(?:does|do)\s+.{1,80}?\s+work$/u,
  // "Explain what this application does", "Explain how the checkout code works": only when the
  // subject is the code itself; "Explain why ..." and "Describe how many ..." ask about intent.
  new RegExp(
    String.raw`^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:explain|describe|summari[sz]e|tell\s+me)\s+(?:what|how)\s+${subject}\s+(?:does|do|is|work|works)$`,
    'u',
  ),
  // "Describe the orders area"
  new RegExp(String.raw`^(?:please\s+)?(?:explain|describe|summari[sz]e)\s+${subject}$`, 'u'),
];

/** "What does OrderService do?": an identifier written in CamelCase or ending in a code word. */
const identifier = String.raw`[A-Z]?[a-z0-9]*(?:[a-z0-9][A-Z]|Service|Controller|Manager|Handler|Repository|Helper|Page|Class)[A-Za-z0-9]*`;
const refusedIdentifierShape = new RegExp(
  String.raw`^(?:What|Which)\s+(?:does|do)\s+${identifier}\s+do$`,
  'u',
);

/**
 * The question as the rules read it: look-alikes, fullwidth forms and invisible characters folded to
 * the plain text they imitate (the fold of the data-block marker check), then letters and digits
 * only with single spaces, and the fillers "actually" and "exactly" dropped.
 */
function plainWords(question: string): string {
  return foldMarkers(question)
    .text.replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(?:actually|exactly|really|even|just)\s+/giu, '')
    .trim();
}

// RF-243
export function asksWhatCodeDoes(question: string): boolean {
  const plain = plainWords(question);
  const lower = plain.toLowerCase();
  return refusedIdentifierShape.test(plain) || refusedShapes.some((shape) => shape.test(lower));
}
