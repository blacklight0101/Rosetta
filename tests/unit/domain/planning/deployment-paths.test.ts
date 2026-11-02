import { describe, expect, it } from 'vitest';
import {
  deploymentRootOf,
  isDeploymentPath,
} from '../../../../src/domain/planning/deployment-paths.js';

// P8-06, RF-601: deployment material read from the path alone, for the scan and for a card's files.

describe('deploymentRootOf', () => {
  it.each([
    ['Kubernetes/eShopModernizedMVC-K8s/deployment.yaml', 'Kubernetes'],
    ['Kubernetes-DockerForWindows/sql/sql.yaml', 'Kubernetes-DockerForWindows'],
    ['ServiceFabric/App/ApplicationManifest.xml', 'ServiceFabric'],
    ['src/Web/Dockerfile', 'src/Web/Dockerfile'],
    ['docker-compose.override.yml', 'docker-compose.override.yml'],
    [
      'src/Web/Properties/PublishProfiles/FolderProfile.pubxml',
      'src/Web/Properties/PublishProfiles/FolderProfile.pubxml',
    ],
    ['.github/workflows/ci.yml', '.github/workflows'],
    ['deploy/k8s/app.yaml', 'deploy'],
    ['charts/helm-app/values.yaml', 'charts/helm-app'],
    ['deploy/', 'deploy'],
  ])('RF-601 %s is deployment material under %s', (path, root) => {
    expect(deploymentRootOf(path)).toBe(root);
  });

  it.each([
    'src/Catalog/',
    'src/DockerHelper.cs',
    'src/Orders/Order.cs',
    'README.md',
    'docs/deploying.md',
  ])('RF-601 %s is not deployment material', (path) => {
    expect(isDeploymentPath(path)).toBe(false);
  });
});
