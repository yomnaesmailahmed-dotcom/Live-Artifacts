// Header, navigation and sign-in gate bindings shared by every workspace page.
import { buildAccount } from './account.js';

const NAV_ON = 'color: #FFFFFF; background: rgba(255,255,255,0.13); font-weight: 600; text-decoration: none;';
const NAV_OFF = 'color: #C9CDDA; text-decoration: none;';

export function buildShell(S, act, active) {
  const role = (S.profile && S.profile.role) || 'member';
  const company = (S.settings && S.settings.company_name) || '';
  return {
    ...buildAccount(S, act),
    brand: company ? `${company.toUpperCase()} · PROJECT CONTROLS` : 'PROJECT CONTROLS',
    navProjects: active === 'projects' ? NAV_ON : NAV_OFF,
    navReview: active === 'review' ? NAV_ON : NAV_OFF,
    navAdmin: active === 'admin' ? NAV_ON : NAV_OFF,
    showAdminLink: role === 'admin',
  };
}
