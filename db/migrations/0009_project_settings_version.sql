-- 0009_project_settings_version: a project's settings carry a version (data-model.md section 4;
-- RF-002, P1-106). Every save of the settings adds one to it, and a save that names the version it
-- started from is applied only if that is still the stored one, in the same statement, so two tabs
-- (or a cap edit and a settings save) can never overwrite each other. Existing projects start at 1.

ALTER TABLE projects ADD COLUMN settings_version integer NOT NULL DEFAULT 1 CHECK (settings_version >= 1);
