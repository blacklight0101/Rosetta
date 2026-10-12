import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { namesAField, problemFor } from '../api/problems.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';

// RF-1001, RF-010, design-system.md section 14 (Start run): the repository card. The address of the
// project is shown in a field; another address is resolved to its own project (and its own start
// page) with Resolve or Start, and a refused address shows its code and reason next to the field
// and starts nothing. The commit is pinned when a run starts, so the card shows the ref asked for.

export interface RepositoryProps {
  readonly project: Project;
  readonly url: string;
  readonly failure: ApiFailure | undefined;
  readonly busy: boolean;
  readonly onUrl: (url: string) => void;
  readonly onResolve: () => void;
}

function Fact(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div class="rst-start__fact">
      <dt>{props.label}</dt>
      <dd class="rst-mono">{props.value}</dd>
    </div>
  );
}

// RF-1001
export function RepositorySection(props: RepositoryProps): JSX.Element {
  const { project, url, failure, busy, onUrl, onResolve } = props;
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="repository-heading">
      <h2 id="repository-heading" class="rst-visually-hidden">
        Repository
      </h2>
      {failure === undefined || namesAField(failure, ['url']) ? null : (
        <ErrorBanner error={failure} />
      )}
      <div class="rst-start__url">
        <Field
          kind="url"
          id="start-url"
          label="GitHub repository URL"
          value={url}
          error={problemFor(failure, 'url')}
          announce={false}
          onInput={onUrl}
        />
        <Button busy={busy} onClick={onResolve}>
          Resolve
        </Button>
      </div>
      <dl class="rst-start__facts">
        <Fact label="Repository" value={project.name} />
        <Fact label="Ref" value={project.ref === '' ? 'default branch' : project.ref} />
        <Fact
          label="Subpath"
          value={project.subpath === '' ? 'whole repository' : project.subpath}
        />
      </dl>
      <p class="rst-settings__note">
        Rosetta pins the ref to a commit and downloads that snapshot once, when a run starts.
      </p>
    </section>
  );
}
