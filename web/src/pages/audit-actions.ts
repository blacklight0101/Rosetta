// RF-1109, data-model.md section 4 (`audit_log`): the actions the audit view can filter by. The
// server accepts any lower-case dotted name, so a new action works in the API before it is listed
// here; the list only gives the administrator a menu instead of a text box.

export const auditActions: readonly string[] = [
  'auth.sign_in',
  'auth.sign_out',
  'auth.locked',
  'user.created',
  'user.password_changed',
  'user.password_reset',
  'user.disabled',
  'user.enabled',
  'user.own_daily_cap_changed',
  'key.saved',
  'key.deleted',
  'admin.workspace_opened',
  'admin.caps_changed',
  'admin.default_roles_changed',
  'request.refused',
];
