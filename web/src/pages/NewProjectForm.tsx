import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { createProject } from '../api/projects.js';
import { namesAField, problemFor } from '../api/problems.js';
import { useApp } from '../app/app-context.js';
import { navigate } from '../app/router.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { Tabs } from '../components/Tabs.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { WorkbookUploadForm } from './WorkbookUploadForm.js';
import { ZipUploadForm } from './ZipUploadForm.js';

// RF-010, design-system.md section 14 (Projects): the New project form. A refused address shows
// its code and reason next to the field and creates nothing; an address that is already a project
// of the user opens that project's start page instead of making a second one. A second tab, Upload
// a zip, makes a project from a zip file instead (RF-128, RFC-004 section 4.5), and a third, Excel
// workbooks, from one or more workbooks (RF-150, RFC-005 section 4.9).

export interface NewProjectFormProps {
  readonly url: string;
  readonly onUrl: (url: string) => void;
  /** Called with a project this submit made; an existing project is opened instead. */
  readonly onCreated: (project: Project) => void;
  /** Called when a zip is stored in the project the Upload a zip tab made (the list reads again). */
  readonly onStored: () => void;
}

interface Creation {
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly message: string;
  readonly submit: () => Promise<void>;
}

function useCreation(props: NewProjectFormProps): Creation {
  const { url, onUrl, onCreated } = props;
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [message, setMessage] = useState('');

  const submit = async (): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    setMessage('');
    const result = await createProject(client, url.trim());
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    const { project, created } = result.value;
    if (!created) {
      navigate(`/projects/${encodeURIComponent(project.id)}`);
      return;
    }
    onUrl('');
    setMessage(`Created ${project.name}.`);
    onCreated(project);
  };
  return { busy, failure, message, submit };
}

// RF-010
function GithubProjectForm(props: NewProjectFormProps): JSX.Element {
  const { busy, failure, message, submit } = useCreation(props);
  const formRef = useRef<HTMLFormElement>(null);
  useRefusalFocus(formRef, failure);
  return (
    <form
      ref={formRef}
      class="rst-projects__create"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {failure === undefined || namesAField(failure, ['url']) ? null : (
        <ErrorBanner error={failure} />
      )}
      <Field
        kind="url"
        id="project-url"
        label="GitHub repository URL"
        placeholder="https://github.com/owner/repo"
        value={props.url}
        help="Public repositories only. Add /tree/<branch>/<folder> to analyse one folder."
        error={problemFor(failure, 'url')}
        announce={false}
        onInput={props.onUrl}
      />
      <div class="rst-projects__actions">
        <Button type="submit" variant="primary" busy={busy}>
          Create project
        </Button>
      </div>
      <p class="rst-settings__note" role="status">
        {message}
      </p>
    </form>
  );
}

const sourceTabs = [
  { id: 'github', label: 'GitHub repository' },
  { id: 'upload', label: 'Upload a zip' },
  { id: 'workbooks', label: 'Excel workbooks' },
] as const;

function SourceForm(props: NewProjectFormProps & { readonly selected: string }): JSX.Element {
  if (props.selected === 'upload') {
    return <ZipUploadForm onCreated={props.onCreated} onStored={props.onStored} />;
  }
  if (props.selected === 'workbooks') {
    return <WorkbookUploadForm onCreated={props.onCreated} onStored={props.onStored} />;
  }
  return <GithubProjectForm {...props} />;
}

// RF-010, RF-128, RF-150
export function NewProjectForm(props: NewProjectFormProps): JSX.Element {
  const [selected, setSelected] = useState<string>('github');
  return (
    <Tabs label="Project source" tabs={sourceTabs} selected={selected} onSelect={setSelected}>
      <SourceForm {...props} selected={selected} />
    </Tabs>
  );
}
