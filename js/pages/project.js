// Entry for Project.dc.html.
import { createSession } from '../state/session-store.js';
import { createProjectStore } from '../state/project-store.js';
import { buildViewModel } from '../view/project/view-model.js';

const session = createSession();
const page = createProjectStore(session);

window.DCPage = Object.freeze({ store: page.store, actions: page.actions, buildViewModel });
window.dispatchEvent(new Event('dcpage:ready'));

session.start();
