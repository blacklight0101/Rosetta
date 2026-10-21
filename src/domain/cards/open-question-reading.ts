import { plainWords } from './open-question.js';

// RF-243, Q-46: an open question that asks for a value, a formula, a count, a list of columns or
// headers, or whether two parts of the workbook or code match is the agent's own reading left
// undone: the file holds the answer. Like the rule of open-question.ts it is a heuristic on the
// wording; a question it is unsure about is left to the user. Questions about intent, reasons,
// external systems, volumes and users never start with these shapes.

/** What a refusal tells the agent (the repair request shows it with the problem's path). */
export const readFileQuestionRefusal =
  'This question asks for a value, a formula, a count, a list of columns or headers, or whether two parts match. The file holds the answer: read the file (read_file or grep) and describe what it shows in a card. Ask an OQ question only about something outside the files: business intent, the reason for a rule, an external system, data volumes or who uses a feature.';

const parts =
  'sheets?|columns?|rows?|tables?|cells?|headers?|tabs?|fields?|files?|functions?|methods?|classes|parameters?|arguments?|ranges?';
const place =
  'cell|column|row|sheet|range|constant|variable|field|parameter|function|method|class|file|line|table';
const subject = String.raw`(?:(?:the|this|that)\s+)?(?:[a-z0-9_.-]+\s+){0,2}(?:${place}|workbook|module)`;
const thing = String.raw`(?:value|values|formula|formulas|formula logic|calculation|expression|constant)`;

const refusedShapes: readonly RegExp[] = [
  // "Does the total number of sheets match the sheets listed in workbook.md?"
  new RegExp(
    String.raw`^(?:does|do|is|are|did)\s+.{1,120}?\b(?:match|matches|equal|equals|agree with|correspond to|is the same as|are the same as)\b(?=.*\b(?:number|count|total|totals|sum|${parts})\b)`,
    'u',
  ),
  // "How many sheets does the workbook have?"
  new RegExp(String.raw`^how\s+many\s+(?:\w+\s+)?(?:${parts})\b`, 'u'),
  // "What is the total number of rows in the sheet?"
  new RegExp(
    String.raw`^what\s+(?:is|are)\s+the\s+(?:total\s+)?(?:number|count)\s+of\s+(?:${parts})\b`,
    'u',
  ),
  // "What is the specific formula logic used in column F?", "What is the value of cell B4?"
  new RegExp(
    String.raw`^what\s+(?:is|are)\s+the\s+(?:\w+\s+){0,3}${thing}\b.*\b(?:${place})\b`,
    'u',
  ),
  // "What formula is used in column F?"
  new RegExp(
    String.raw`^what\s+${thing}\s+(?:is|are)\s+(?:used|stored|held|set|applied)\s+(?:in|on|for)\b`,
    'u',
  ),
  // "What are the headers of the Loans sheet?"
  new RegExp(
    String.raw`^what\s+(?:is|are)\s+the\s+(?:\w+\s+){0,2}(?:columns|headers|sheets|fields|parameters|arguments|column names|sheet names)\s+(?:of|in|on)\s+`,
    'u',
  ),
  // "Which columns does the Loans table have?", "What parameters does this function take?"
  new RegExp(
    String.raw`^(?:which|what)\s+(?:columns|headers|sheets|fields|tables|parameters|arguments)\s+(?:does|do)\s+${subject}\s+(?:have|has|contain|hold|take|accept|expect)$`,
    'u',
  ),
  // "Are all the columns of the table visible as headers in the first row?"
  new RegExp(
    String.raw`^(?:are|is|do|does)\s+(?:all|every|each)\s+(?:the\s+)?(?:\w+\s+){0,2}(?:columns|rows|sheets|fields|tables)\b.*\b(?:visible|present|listed|shown|included|named|exist|headers?)\b`,
    'u',
  ),
  // "What does this function return?"
  new RegExp(
    String.raw`^what\s+(?:does|do)\s+${subject}\s+(?:return|take|accept|call|contain|hold|store|expect)$`,
    'u',
  ),
];

/** A question about how much there is in a month or in production asks for volumes, which no file holds. */
const volume = /\b(?:per|each|every)\s+(?:day|week|month|year|hour)\b|\bin\s+production\b/u;

// RF-243
export function asksWhatTheFileAnswers(question: string): boolean {
  const lower = plainWords(question).toLowerCase();
  return !volume.test(lower) && refusedShapes.some((shape) => shape.test(lower));
}
