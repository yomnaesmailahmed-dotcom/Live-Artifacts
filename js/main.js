// Entry point. The DC runtime evaluates the component in Main.dc.html as a classic script,
// so the module graph is exposed to it through one frozen global.
import { createAppStore } from './state/app-store.js';
import { buildViewModel } from './view/view-model.js';

const store = createAppStore();

window.SummaryRefresh = Object.freeze({ store, buildViewModel });
window.dispatchEvent(new Event('summary-refresh:ready'));

store.start();
