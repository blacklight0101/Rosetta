import { h, type ComponentChild } from 'preact';
import type { ReportModel, ReportQuestion } from '../../../application/report/report-model.js';
import { renderPage } from '../page-shell.js';
import { isUploadModel } from '../report-source.js';
import { plural } from '../report-format.js';
import { Glyph, Headline, ModelText } from './parts.js';
import { renderStatic } from './static-render.js';

// RF-500, RF-507, RF-1013, ADR-021: `questions.html`, the open questions the run raised and the
// answers the owner gave (data-model.md section 3.16). Question, context and answer are model or
// owner text, so they are shown as text. The state is a word and a glyph, never colour alone.

const CARD_ID = /^OQ-\d+$/u;

function CardId(props: { readonly cardId: string }): ComponentChild {
  const { cardId } = props;
  return CARD_ID.test(cardId)
    ? h('a', { class: 'mono', href: `../cards/OQ/${cardId}.md` }, cardId)
    : h('span', { class: 'mono' }, cardId);
}

function State(props: { readonly answered: boolean }): ComponentChild {
  const { answered } = props;
  return h(
    'span',
    { class: `state state-${answered ? 'answered' : 'open'}` },
    h(Glyph, { name: answered ? 'check' : 'open' }),
    answered ? 'Answered' : 'Open',
  );
}

function Question(props: { readonly question: ReportQuestion }): ComponentChild {
  const { cardId, question, context, answer } = props.question;
  return h(
    'li',
    { class: 'question' },
    h(
      'p',
      null,
      h(State, { answered: answer !== '' }),
      ' ',
      h(CardId, { cardId }),
      ' ',
      h(ModelText, { text: question }),
    ),
    h('p', { class: 'context' }, h(ModelText, { text: context })),
    answer === '' ? null : h('p', { class: 'answer' }, 'Answer: ', h(ModelText, { text: answer })),
  );
}

function summaryOf(questions: readonly ReportQuestion[]): string {
  const answered = questions.filter((each) => each.answer !== '').length;
  const open = questions.length - answered;
  return `${plural(questions.length, 'question')}: ${String(answered)} answered, ${String(open)} open.`;
}

/** RF-243, RF-646, EV-57: the pairs of questions merged into one, each with the run that asked it. */
function MergedQuestions(props: { readonly model: ReportModel }): ComponentChild {
  const pairs = props.model.mergedQuestions ?? [];
  if (pairs.length === 0) return null;
  return h(
    'section',
    null,
    h('h2', null, 'Merged questions'),
    h('p', null, 'Each question below asked the same as an earlier one and was merged into it.'),
    h(
      'ol',
      { id: 'merged-questions', class: 'questions' },
      pairs.map((pair) =>
        h(
          'li',
          { class: 'question' },
          h(
            'p',
            null,
            'Kept ',
            h(CardId, { cardId: pair.keptCardId }),
            ' (run ',
            pair.keptRunKey,
            '): ',
          ),
          h('p', null, h(ModelText, { text: pair.keptQuestion })),
          h(
            'p',
            null,
            'Merged ',
            h(CardId, { cardId: pair.mergedCardId }),
            ' (run ',
            pair.mergedRunKey,
            '): ',
          ),
          h('p', null, h(ModelText, { text: pair.mergedQuestion })),
        ),
      ),
    ),
  );
}

function Questions(props: { readonly model: ReportModel }): ComponentChild {
  const { questions } = props.model;
  if (questions.length === 0) {
    return h(
      'div',
      null,
      h('h1', null, 'Open questions'),
      h('p', null, 'This run raised no open questions.'),
      h(MergedQuestions, { model: props.model }),
    );
  }
  return h(
    'div',
    null,
    h('h1', null, 'Open questions'),
    h(Headline, null, summaryOf(questions)),
    h(
      'ol',
      { id: 'questions', class: 'questions' },
      questions.map((question) => h(Question, { question })),
    ),
    h(MergedQuestions, { model: props.model }),
  );
}

// RF-500, RF-507, RF-1013
export function renderQuestionsHtml(model: ReportModel): string {
  const main = renderStatic(h(Questions, { model }));
  return renderPage({
    page: 'questions',
    runKey: model.runKey,
    title: 'Open questions',
    main,
    upload: isUploadModel(model),
  });
}
