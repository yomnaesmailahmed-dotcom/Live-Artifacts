// Entry for Projects.dc.html.
import { createSession } from '../state/session-store.js';
import { createPortfolioStore } from '../state/portfolio-store.js';
import { buildViewModel } from '../view/portfolio/view-model.js';

const session = createSession();
const page = createPortfolioStore(session);

window.DCPage = Object.freeze({ store: page.store, actions: page.actions, buildViewModel });
window.dispatchEvent(new Event('dcpage:ready'));

session.start();
