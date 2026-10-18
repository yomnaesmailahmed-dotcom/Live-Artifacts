// Mirrors the private.can_* helpers in the database so the UI only offers what RLS will allow.

export const GLOBAL_ROLES = [['admin', 'Admin'], ['management', 'Management'], ['member', 'Member']];
export const PROJECT_ROLES = [
  ['dm', 'Design Manager (DM)'],
  ['ptm', 'Project Technical Manager (PTM)'],
  ['team', 'Team member'],
  ['viewer', 'Viewer'],
];
export const PROJECT_ROLE_SHORT = { dm: 'DM', ptm: 'PTM', team: 'TEAM', viewer: 'VIEWER' };

export function projectPermissions(globalRole, projectRole) {
  const mgmt = globalRole === 'admin' || globalRole === 'management';
  return {
    canRead: mgmt || !!projectRole,
    canEdit: mgmt || projectRole === 'dm' || projectRole === 'ptm',
    canManage: mgmt || projectRole === 'dm',
    canDelete: mgmt,
    canContribute: mgmt || ['dm', 'ptm', 'team'].includes(projectRole),
  };
}
