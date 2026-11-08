import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import { EveryRoleControl } from './EveryRoleControl.js';
import type { ModelListState } from './model-lists.js';
import { problemText, type RoleWarningFacts } from './role-warning.js';

// RF-436, P8-74, the `P8ProjectSettings` artboard: the warning at the top of the project settings
// page when a role's provider cannot be used now. It names each such provider and its roles, says
// what the user can use instead, and holds the every-role control (DEC-225); with nothing usable it
// says where to add a key. It changes no role by itself.

interface RoleWarningProps {
  readonly facts: RoleWarningFacts;
  readonly lists: Readonly<Record<string, ModelListState>>;
  readonly onApply: (provider: string, model: string) => void;
  /** P8-75: a line before the control, shown with it, that says what Apply does on this page. */
  readonly note?: string;
}

function Closing({ usable }: { readonly usable: string | undefined }): JSX.Element {
  if (usable !== undefined) return <p>{usable}</p>;
  return (
    <p>
      Add your own key in <Link href="/settings">Settings and keys</Link>, or ask the administrator
      to allow the server&apos;s key.
    </p>
  );
}

// RF-436
export function RoleWarning({ facts, lists, onApply, note }: RoleWarningProps): JSX.Element {
  return (
    <div class="rst-callout rst-callout--warn" role="alert">
      <div class="rst-callout__row">
        <span class="rst-callout__icon">
          <Glyph name="warning-triangle" />
        </span>
        <div class="rst-callout__body">
          {facts.problems.map((problem) => {
            const { title, detail } = problemText(problem);
            return (
              <p key={problem.provider}>
                <strong>{title}</strong> {detail}
              </p>
            );
          })}
          <Closing usable={facts.usable} />
          {note === undefined || facts.usable === undefined ? null : <p>{note}</p>}
          <EveryRoleControl providers={facts.providers} lists={lists} onApply={onApply} />
        </div>
      </div>
    </div>
  );
}
