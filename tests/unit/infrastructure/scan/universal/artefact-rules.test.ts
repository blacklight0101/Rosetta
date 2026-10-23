import { describe, expect, it } from 'vitest';
import { artefactKindsOf } from '../../../../../src/infrastructure/scan/universal/artefact-rules.js';

describe('artefact rules', () => {
  it.each([
    ['Default.aspx', ['page']],
    ['Catalog/Details.aspx', ['page']],
    ['legacy/login.asp', ['page']],
    ['web/index.jsp', ['page']],
    ['src/helpers.php', ['page']],
    ['Views/Home.cshtml', ['page']],
  ])('RF-102 %s is tagged %j', (path, kinds) => {
    expect(artefactKindsOf(path)).toEqual(kinds);
  });

  it.each([
    ['Controllers/CatalogController.cs', ['controller']],
    ['src/OrderController.php', ['controller', 'page']],
    ['api/UsersController.java', ['controller']],
    ['api/usersController.ts', ['controller']],
  ])('RF-102 %s is a controller', (path, kinds) => {
    expect(artefactKindsOf(path)).toEqual(kinds);
  });

  it.each([
    ['Program.cs', ['entry-point']],
    ['src/Program.vb', ['entry-point']],
    ['cmd/main.go', ['entry-point']],
    ['src/main.c', ['entry-point']],
    ['app/Main.java', ['entry-point']],
    ['Global.asax', ['entry-point']],
    ['Global.asax.cs', ['entry-point']],
    ['index.php', ['entry-point', 'page']],
    ['manage.py', ['entry-point']],
  ])('RF-102 %s is an entry point', (path, kinds) => {
    expect(artefactKindsOf(path)).toEqual(kinds);
  });
});

describe('artefact rules (part 2)', () => {
  it.each([
    ['Web.config', ['configuration']],
    ['src/App.config', ['configuration']],
    ['NLog.config', ['configuration']],
    ['app.properties', ['configuration']],
    ['config.ini', ['configuration']],
    ['appsettings.json', ['configuration']],
    ['appsettings.Production.json', ['configuration']],
  ])('RF-102 %s is configuration', (path, kinds) => {
    expect(artefactKindsOf(path)).toEqual(kinds);
  });

  it.each([
    ['db/schema.sql', ['database-script']],
    ['Seed.SQL', ['database-script']],
  ])('RF-102 %s is a database script', (path, kinds) => {
    expect(artefactKindsOf(path)).toEqual(kinds);
  });
});

describe('artefact rules (part 3)', () => {
  it.each([
    ['packages.config', ['manifest']],
    ['ShopWeb.csproj', ['deployment', 'manifest']],
    ['Lib.vbproj', ['deployment', 'manifest']],
    ['pom.xml', ['manifest']],
    ['composer.json', ['manifest']],
    ['package.json', ['manifest']],
    ['requirements.txt', ['manifest']],
    ['build.gradle', ['manifest']],
  ])('RF-102 %s is a dependency manifest', (path, kinds) => {
    expect(artefactKindsOf(path)).toEqual(kinds);
  });

  it.each([
    'notes.xyz',
    'README.md',
    'LEDGER.cbl',
    'package-lock.json',
    'domain/Programmer.cs',
    'src/ControllerBase.cs',
    'docs/main.md',
    'src/Order.cs',
  ])('RF-102 %s has no known kind and is still a file', (path) => {
    expect(artefactKindsOf(path)).toEqual([]);
  });
});

describe('artefact rules (part 4)', () => {
  it.each([
    ['Properties/PublishProfiles/Staging.pubxml', ['deployment']],
    ['Shop.sln', ['deployment']],
    ['.github/workflows/ci.yml', ['deployment']],
    ['azure-pipelines.yml', ['deployment']],
    ['.gitlab-ci.yml', ['deployment']],
    ['Jenkinsfile', ['deployment']],
    ['Dockerfile', ['deployment']],
  ])('RF-102 %s is build and deployment configuration', (path, kinds) => {
    expect(artefactKindsOf(path)).toEqual(kinds);
  });
});
