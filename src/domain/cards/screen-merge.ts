import type { CitedText, ScreenAction, ScreenDetail, ScreenField } from './flow-screen.js';

// RF-250, RF-261, Q-52: two `SCRN` cards for the same sheet or page become one card whose screen
// detail holds everything either one saw: the route of the first, the roles, the fields (a field
// of the same name once, with the validations of both), the actions and the links, each once and
// in the order first seen. Nothing is dropped, so no validation citation is lost. Two choices lose
// no claim but are the first card's: the route (the merged card names one; another route stays in
// the claim "The screen is at the route ..." of its card) and the input kind of a field.

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function sameCitations(left: CitedText, right: CitedText): boolean {
  return (
    left.text === right.text && JSON.stringify(left.citations) === JSON.stringify(right.citations)
  );
}

function validationsOf(fields: readonly ScreenField[]): readonly CitedText[] {
  const kept: CitedText[] = [];
  for (const validation of fields.flatMap((field) => field.validations)) {
    if (!kept.some((each) => sameCitations(each, validation))) kept.push(validation);
  }
  return kept;
}

function mergedFields(screens: readonly ScreenDetail[]): readonly ScreenField[] {
  const all = screens.flatMap((screen) => screen.fields);
  return unique(all.map((field) => field.name)).map((name) => {
    const same = all.filter((field) => field.name === name);
    const [first] = same;
    return {
      name,
      inputKind: first?.inputKind ?? '',
      required: same.some((field) => field.required),
      validations: validationsOf(same),
    };
  });
}

function mergedActions(screens: readonly ScreenDetail[]): readonly ScreenAction[] {
  const kept = new Map<string, ScreenAction>();
  for (const action of screens.flatMap((screen) => screen.actions)) {
    const key = JSON.stringify([action.label, action.handler, action.flow]);
    if (!kept.has(key)) kept.set(key, action);
  }
  return [...kept.values()];
}

/** The screen detail of the merged card; undefined when none of the cards holds one. */
export function mergedScreen(screens: readonly ScreenDetail[]): ScreenDetail | undefined {
  const [first] = screens;
  if (first === undefined) return undefined;
  return {
    route: first.route,
    roles: unique(screens.flatMap((screen) => screen.roles)),
    fields: mergedFields(screens),
    actions: mergedActions(screens),
    leadsTo: unique(screens.flatMap((screen) => screen.leadsTo)),
  };
}
