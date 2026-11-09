import type { JSX } from 'preact';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { Field } from '../components/Field.js';
import type { ProjectRename } from './use-project-rename.js';

// RF-010, P8-134, DEC-222: the dialog "Rename" opens from the row menu. The `P8Projects` artboard draws
// the menu item and not what it opens, so this is the confirmation dialog of the design system
// (section 7) with one "Project name" field; Enter in the field saves, as the Rename button does, and
// a refusal is shown under the field with its code.

// RF-010
export function RenameProjectDialog(props: { readonly rename: ProjectRename }): JSX.Element | null {
  const { target, name, busy, error, type, save, cancel } = props.rename;
  if (target === undefined) return null;
  const problem =
    error === undefined
      ? undefined
      : { code: error.code, message: [error.message, error.nextStep].join(' ').trim() };
  return (
    <ConfirmDialog
      title={`Rename project ${target.name}`}
      confirmLabel="Rename"
      confirmVariant="primary"
      busy={busy}
      onConfirm={save}
      onCancel={cancel}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Field
          kind="text"
          id="rename-project-name"
          label="Project name"
          value={name}
          error={problem}
          onInput={type}
        />
      </form>
    </ConfirmDialog>
  );
}
