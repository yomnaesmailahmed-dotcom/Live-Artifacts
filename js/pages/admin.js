// Entry for Admin.dc.html.
import { mountAssistant } from '../ui/assistant.js';
import { createSession } from '../state/session-store.js';
import { createAdminStore } from '../state/admin-store.js';
import { buildViewModel } from '../view/admin/view-model.js';

const session = createSession();
const page = createAdminStore(session);

window.DCPage = Object.freeze({ store: page.store, actions: page.actions, buildViewModel });
window.dispatchEvent(new Event('dcpage:ready'));

session.start();
mountAssistant();
