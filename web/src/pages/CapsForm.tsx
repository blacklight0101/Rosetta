import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { saveCaps } from '../api/admin.js';
import type { Caps, Money } from '../api/admin-schemas.js';
import type { ApiFailure } from '../api/client.js';
import { namesAField, problemFor } from '../api/problems.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { dollarsToMicros, microsToDollars, RUN_COST_MAX_MICROS } from '../lib/usd.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { serverMonthOf } from './admin-month.js';
import { ServerMeter } from './ServerMeter.js';

// RF-1106, DEC-107, design-system.md section 14 (administration: users): the caps on the server
// keys, typed in dollars and saved as micro-dollars, with the server's month to date against its
// monthly cap. A figure that is not an amount is refused on its field before anything is sent;
// anything else the server refuses (a negative cap) shows next to the field with its code.

type CapField = keyof Caps;

const capFields: readonly {
  readonly name: CapField;
  readonly id: string;
  readonly label: string;
}[] = [
  { name: 'runMicros', id: 'cap-run', label: 'Per run (USD)' },
  { name: 'userDayMicros', id: 'cap-user-day', label: 'Per user per day (USD)' },
  { name: 'serverMonthMicros', id: 'cap-server-month', label: 'Server per month (USD)' },
];

const notAnAmount = { message: 'Enter an amount in dollars, for example 0.50.' };

type Texts = Readonly<Record<CapField, string>>;

const textsOf = (caps: Caps): Texts => ({
  runMicros: microsToDollars(caps.runMicros),
  userDayMicros: microsToDollars(caps.userDayMicros),
  serverMonthMicros: microsToDollars(caps.serverMonthMicros),
});

/** The caps in micro-dollars, or the fields whose text is not an amount. */
function capsOf(texts: Texts): { readonly caps?: Caps; readonly bad: readonly CapField[] } {
  const micros = capFields.map(
    ({ name }) =>
      [
        name,
        dollarsToMicros(texts[name], name === 'runMicros' ? RUN_COST_MAX_MICROS : undefined),
      ] as const,
  );
  const bad = micros.filter(([, value]) => value === undefined).map(([name]) => name);
  const [runMicros, userDayMicros, serverMonthMicros] = micros.map(([, value]) => value);
  if (runMicros === undefined || userDayMicros === undefined || serverMonthMicros === undefined) {
    return { bad };
  }
  return { caps: { runMicros, userDayMicros, serverMonthMicros }, bad };
}

interface CapsEditing {
  readonly texts: Texts;
  readonly bad: readonly CapField[];
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly message: string;
  /** Changes on every refusal, so focus moves to the first invalid field each time. */
  readonly refusals: number;
  readonly type: (name: CapField, value: string) => void;
  readonly submit: () => Promise<void>;
}

function useCapsEditing(caps: Caps, onSaved: (caps: Caps) => void): CapsEditing {
  const { client } = useApp();
  const [texts, setTexts] = useState(textsOf(caps));
  const [bad, setBad] = useState<readonly CapField[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [message, setMessage] = useState('');
  const [refusals, setRefusals] = useState(0);

  const submit = async (): Promise<void> => {
    const parsed = capsOf(texts);
    setFailure(undefined);
    setMessage('');
    setBad(parsed.bad);
    if (parsed.caps === undefined) {
      setRefusals((count) => count + 1);
      return;
    }
    setBusy(true);
    const result = await saveCaps(client, parsed.caps);
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      setRefusals((count) => count + 1);
      return;
    }
    setTexts(textsOf(result.value));
    setMessage('Caps saved.');
    onSaved(result.value);
  };
  const type = (name: CapField, value: string): void => {
    setTexts((current) => ({ ...current, [name]: value }));
    setBad((current) => current.filter((field) => field !== name));
  };
  return { texts, bad, busy, failure, message, refusals, type, submit };
}

function CapInputs({ editing }: { readonly editing: CapsEditing }): JSX.Element {
  const { texts, bad, failure } = editing;
  return (
    <div class="rst-admin__triple">
      {capFields.map(({ name, id, label }) => (
        <Field
          key={name}
          kind="text"
          id={id}
          label={label}
          value={texts[name]}
          error={bad.includes(name) ? notAnAmount : problemFor(failure, name)}
          announce={false}
          onInput={(value) => {
            editing.type(name, value);
          }}
        />
      ))}
    </div>
  );
}

// RF-1106
export function CapsForm(props: {
  readonly caps: Caps;
  readonly spent: readonly Money[];
  readonly onSaved: (caps: Caps) => void;
}): JSX.Element {
  const { caps, spent, onSaved } = props;
  const editing = useCapsEditing(caps, onSaved);
  const { busy, failure, message, refusals } = editing;
  const formRef = useRef<HTMLFormElement>(null);
  useRefusalFocus(formRef, refusals);
  return (
    <section id="caps" class="rst-card rst-settings__section" aria-labelledby="caps-title">
      <h2 id="caps-title" class="rst-settings__heading">
        Caps on server keys
      </h2>
      <ServerMeter month={serverMonthOf(spent, BigInt(caps.serverMonthMicros))} />
      <form
        ref={formRef}
        class="rst-admin__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void editing.submit();
        }}
      >
        {failure === undefined ||
        namesAField(
          failure,
          capFields.map(({ name }) => name),
        ) ? null : (
          <ErrorBanner error={failure} />
        )}
        <CapInputs editing={editing} />
        <div class="rst-projects__actions">
          <Button type="submit" variant="primary" busy={busy}>
            Save caps
          </Button>
        </div>
        <p class="rst-settings__note" role="status">
          {message}
        </p>
        <p class="rst-settings__note">
          A call is refused before it is made when its worst case would cross any cap.
        </p>
      </form>
    </section>
  );
}
