import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Project } from '../api/project-schemas.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { RoleWarning } from './RoleWarning.js';
import { useStartRoleWarning } from './use-start-role-warning.js';

// RF-436, P8-75: the warning of the project settings page (P8-74), at the top of the start page.
// The start page has no Save, so the warning says that Apply saves the project settings; after it,
// a line says what was saved and takes the focus the vanished warning held.

const savesNote =
  'Apply to every role saves this choice in the project settings, so every run of this project uses it.';

interface StartRoleWarningProps {
  readonly project: Project;
  readonly onSaved: (project: Project) => void;
}

// RF-436
export function StartRoleWarning({ project, onSaved }: StartRoleWarningProps): JSX.Element {
  const { warning, lists, apply, saved, error } = useStartRoleWarning(project, onSaved);
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (saved !== undefined) line.current?.focus();
  }, [saved]);
  return (
    <>
      {warning === undefined ? null : (
        <RoleWarning facts={warning} lists={lists} onApply={apply} note={savesNote} />
      )}
      {error === undefined ? null : <ErrorBanner error={error} />}
      <div role="status">
        {saved === undefined ? null : (
          <>
            <p class="rst-settings__note" tabIndex={-1} ref={line}>
              {saved.line}
            </p>
            {saved.notice === '' ? null : <p class="rst-settings__note">{saved.notice}</p>}
          </>
        )}
      </div>
    </>
  );
}
