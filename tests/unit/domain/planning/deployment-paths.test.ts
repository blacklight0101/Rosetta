import { describe, expect, it } from 'vitest';
import { deploymentRootOf, isCiFile } from '../../../../src/domain/planning/deployment-paths.js';

// P8-06, RF-601: deployment material read from the path alone, by exact anchored names; a folder
// with a manifest is a module, never deployment; a CI file is named apart, not counted.

describe('deploymentRootOf', () => {
  it.each([
    ['Kubernetes/eShopModernizedMVC-K8s/deployment.yaml', 'Kubernetes'],
    ['Kubernetes-DockerForWindows/sql/sql.yaml', 'Kubernetes-DockerForWindows'],
    ['ServiceFabric/App/ApplicationManifest.xml', 'ServiceFabric'],
    ['src/Web/Dockerfile', 'src/Web/Dockerfile'],
    ['src/Web/Dockerfile.windows', 'src/Web/Dockerfile.windows'],
    ['docker-compose.override.yml', 'docker-compose.override.yml'],
    [
      'src/Web/Properties/PublishProfiles/FolderProfile.pubxml',
      'src/Web/Properties/PublishProfiles/FolderProfile.pubxml',
    ],
    ['deploy/k8s/app.yaml', 'deploy'],
    ['charts/helm-app/values.yaml', 'charts/helm-app'],
  ])('RF-601 %s is deployment material under %s', (path, root) => {
    expect(deploymentRootOf(path)).toBe(root);
  });

  it.each([
    'src/Catalog/Item.cs',
    'src/DockerHelper.cs',
    'Models/Deployment/Plan.cs',
    'src/Models/Deployment/Plan.cs',
    'Helmet/a.cs',
    'src/Helmet/a.cs',
    'docs/docker/notes.md',
    'docs/k8s/setup.yaml',
    'tests/docker/x.ts',
    'src/Dockerfile.cs',
    'src/docker-compose-helper.yaml',
    '.github/workflows/test.yml',
    'azure-pipelines.yml',
  ])('RF-601 %s is not deployment material', (path) => {
    expect(deploymentRootOf(path)).toBeUndefined();
  });

  it.each([
    ['HelmetService/HelmetService.cs', 'HelmetService'],
    ['KubernetesClient/Client.cs', 'KubernetesClient'],
    ['Foo.ServiceFabric/Service.cs', 'Foo.ServiceFabric'],
    ['src/App/deploy/settings.json', 'src/App'],
  ])('RF-601 %s inside the module folder %s is no deployment material', (path, module) => {
    expect(deploymentRootOf(path, new Set([module]))).toBeUndefined();
  });
});

describe('isCiFile', () => {
  it.each([
    '.github/workflows/test.yml',
    '.github/workflows/deploy.yaml',
    'azure-pipelines.yml',
    'Jenkinsfile',
  ])('RF-601 %s is a CI file, named apart', (path) => {
    expect(isCiFile(path)).toBe(true);
  });

  it.each(['src/workflows/a.yml', '.github/dependabot.yml', 'Dockerfile'])(
    'RF-601 %s is no CI file',
    (path) => {
      expect(isCiFile(path)).toBe(false);
    },
  );
});
