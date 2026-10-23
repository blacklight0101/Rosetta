import { plainWords } from './open-question.js';

// RF-243, P5-02, EV-09: an open question that asks what a header, a column or a module means or does,
// when the lines it cites DEFINE the name it asks about, is the agent's own reading left undone. A
// refused question is a lost owner question, so the rule is narrow and deterministic (no model call):
//   - the question has one of a few plain shapes ("what does X mean", "what is the role of X") with no
//     condition after the name (when, if, for, ...) and no word of intent, people, volumes, reasons or
//     external systems;
//   - X is marked in the question (quoted, or written like a code identifier, never a bare parenthesis);
//   - a cited line defines X: a header cell or `col: X` label, `Attribute VB_Name = "X"`, a
//     Sub/Function/Class/Module declaration, a defining assignment, or a comment `X: ...`. A bare
//     mention, a call, a string literal, a line with `?` and a TODO or FIXME line never count.

const asksMeaning: readonly RegExp[] = [
  // "What does column D ("Qty") represent in the Assets sheet?"
  /^what\s+(?:does|do)\s+.+\s+(?:mean|represent|represents|stand for|hold|contain|store)(?:\s+in\s+the\s+(?:(?!when\b|if\b|for\b|while\b|unless\b|after\b|before\b)\w+\s+){0,3}?(?:sheet|module|file|workbook|table|report))?$/u,
  // "What is the role of the modLoans module?"
  /^what\s+(?:is|are)\s+the\s+(?:role|purpose|meaning|function)\s+of\s+[\w ]{1,60}$/u,
  // "What does the modLoans module do?"
  /^what\s+(?:does|do)\s+.+\s+do$/u,
  // "What is the Qty column used for?"
  /^what\s+(?:is|are)\s+.+\s+used\s+for$/u,
];

const condition =
  /\b(?:when|whenever|if|while|unless|after|before|during|where|because|but|with|without|for|per|between|than|then)\b/u;

const intent =
  /\b(?:why|reasons?|business|users?|team|volumes?|agreed|expect|expects|expected|production|who|external|systems?|third party|api|service|vendor|partner|integration|interface)\b/u;

const marked: readonly RegExp[] = [
  /["“”`]([^"“”`]{2,40})["“”`]/gu,
  /(?<![\p{L}\p{N}])'([^']{2,40})'(?![\p{L}\p{N}])/gu,
  /\b([a-z]+[A-Z][A-Za-z0-9]*|[A-Za-z0-9]+_[A-Za-z0-9_]+)\b/gu,
];

function namesIn(question: string): readonly string[] {
  const names = marked.flatMap((pattern) =>
    [...question.matchAll(pattern)].map((found) =>
      (found[1] ?? '').replace(/^["“”`']+|["“”`']+$/gu, '').trim(),
    ),
  );
  return [...new Set(names.filter((name) => name.length >= 2))];
}

function escaped(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

const edge = String.raw`[\p{L}\p{N}_]`;

const literal = String.raw`(?:-?\d[\d.,_]*|"[^"]*"|'[^']*'|true|false|null|nothing|empty)`;

/** Patterns that define the name on any line of a cited range. */
function definitionPatterns(name: string): readonly RegExp[] {
  const n = `(?<!${edge})${escaped(name)}(?!${edge})`;
  const flags = 'iu';
  return [
    // `D: Qty`, `col D = Qty`: a label line
    new RegExp(String.raw`^\s*[A-Za-z]{1,3}\s*[:.)\-]\s*${n}\s*$`, flags),
    new RegExp(
      String.raw`^\s*(?:col(?:umn)?\s*[A-Za-z0-9]{1,3}|[A-Za-z]{1,3})\s*[:=]\s*${n}\s*$`,
      flags,
    ),
    new RegExp(String.raw`^\s*attribute\s+vb_name\s*=\s*"${n}"`, flags),
    new RegExp(
      String.raw`^\s*(?:(?:public|private|friend|static|export|default|abstract|sealed|internal)\s+)*(?:sub|function|class|module|def|interface)\s+${n}`,
      flags,
    ),
    // the name is the only target and the value is a literal, never a read of the name or a column
    new RegExp(
      String.raw`^\s*(?:(?:const|dim|var|let|public|private|static|readonly)\s+)*(?:[\w.<>\[\]]+\s+)?${n}\s*(?::\s*[\w.<>\[\]]+\s*)?=\s*${literal}\s*;?\s*(?:'.*|//.*)?$`,
      flags,
    ),
    new RegExp(String.raw`^\s*(?:'|//|#|--|/?\*)\s*${n}\s*[:=\-]\s*\S`, flags),
  ];
}

/** Patterns that define the name only on the first line of a cited range, the header row. */
function headerPatterns(name: string): readonly RegExp[] {
  const n = `(?<!${edge})${escaped(name)}(?!${edge})`;
  return [
    new RegExp(String.raw`^\s*${n}\s*$`, 'iu'),
    new RegExp(String.raw`(?:^|[|\t,;])\s*${n}\s*(?:[|\t,;]|$)`, 'iu'),
  ];
}

const dataCell = /(?:^|[|\t,;])\s*-?\d[\d.,]*\s*(?:[|\t,;]|$)/u;

function defines(cited: string, name: string): boolean {
  const patterns = definitionPatterns(name);
  const header = headerPatterns(name);
  return cited.split(/\r?\n/u).some((line, index) => {
    if (line.includes('?') || /\b(?:TODO|FIXME)\b/iu.test(line)) return false;
    if (patterns.some((pattern) => pattern.test(line))) return true;
    // a header row has no number in it: `Laptop,Qty,5` is a data row
    return index === 0 && !dataCell.test(line) && header.some((pattern) => pattern.test(line));
  });
}

/** The name the cited lines define that the question asks about, or undefined when the question stands. */
// RF-243
export function nameAnsweredByCitedLines(question: string, cited: string): string | undefined {
  const lower = plainWords(question).toLowerCase();
  if (intent.test(lower)) return undefined;
  if (!asksMeaning.some((shape) => shape.test(lower))) return undefined;
  if (condition.test(lower.replace(/\b(?:used|stand)\s+for\b/gu, ''))) return undefined;
  return namesIn(question).find((name) => defines(cited, name));
}
