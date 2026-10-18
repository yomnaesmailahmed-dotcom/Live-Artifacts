// Header, navigation and sign-in gate bindings shared by every workspace page.
import { buildAccount } from './account.js';

const NAV_ON = 'color: #16191D; font-weight: 600; text-decoration: none; border-bottom: 2px solid #16191D; padding-bottom: 2px;';
const NAV_OFF = 'color: #3A3F46; text-decoration: none; padding-bottom: 2px;';

export function buildShell(S, act, active) {
  const role = (S.profile && S.profile.role) || 'member';
  const company = (S.settings && S.settings.company_name) || 'Project Controls';
  return {
    ...buildAccount(S, act),
    companyName: company.toUpperCase(),
    navProjects: active === 'projects' ? NAV_ON : NAV_OFF,
    navReview: active === 'review' ? NAV_ON : NAV_OFF,
    navAdmin: active === 'admin' ? NAV_ON : NAV_OFF,
    showAdminLink: role === 'admin',
  };
}
