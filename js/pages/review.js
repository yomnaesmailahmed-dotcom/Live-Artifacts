// Entry for Main.dc.html (management review).
import { createSession } from '../state/session-store.js';
import { createReviewStore } from '../state/review-store.js';
import { buildViewModel } from '../view/review/view-model.js';

const session = createSession();
const page = createReviewStore(session);

window.DCPage = Object.freeze({ store: page.store, actions: page.actions, buildViewModel });
window.dispatchEvent(new Event('dcpage:ready'));

session.start();
