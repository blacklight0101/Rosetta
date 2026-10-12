// RF-1108, RF-1002: what the live page says about a run that ended with an error code. The words are
// those of the error catalogue (descriptions.ts) for the codes a run can end with; any other code is
// shown as it is, with a pointer to the catalogue.

export interface RunFailureText {
  readonly message: string;
  readonly nextStep: string;
  /** A page where the user can fix it, when there is one. */
  readonly fix: { readonly href: string; readonly label: string } | undefined;
}

const settings = { href: '/settings', label: 'Settings and keys' } as const;

const known: Readonly<Record<string, RunFailureText>> = {
  'RST-2302': {
    message: 'There is no API key you may use for this provider.',
    nextStep:
      'Save your own key for it in your settings, or ask an administrator to allow server keys for your account.',
    fix: settings,
  },
  'RST-1203': {
    message: 'The project has no completed scan, so there is no code map to understand.',
    nextStep: 'Run a scan of the project first, then start understand again.',
    fix: undefined,
  },
  'RST-1307': {
    message: 'An area named in the request is not in the code map of the latest scan.',
    nextStep:
      'Start the run again with areas from the start page, or without areas to read every area.',
    fix: undefined,
  },
  'RST-1600': {
    message: 'A model call was not made because it could pass a spending or token cap.',
    nextStep:
      'The results so far are saved. Raise the run cap in the project settings, wait for the next UTC day, or ask the administrator about the server caps.',
    fix: undefined,
  },
  'RST-1506': {
    message: 'A model call failed.',
    nextStep: 'Check the provider in your settings and start the run again.',
    fix: settings,
  },
};

// RF-1108
export function failureTextFor(code: string): RunFailureText {
  return Object.hasOwn(known, code) && known[code] !== undefined
    ? known[code]
    : {
        message: 'The run ended with an error.',
        nextStep: 'Look the code up in the error catalogue, or report it.',
        fix: undefined,
      };
}
