/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

import '@/styles/settings.scss';

// Plugins
import { registerPlugins } from '@/plugins'
import { i18n } from '@/i18n'

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

const app = createApp(App)
registerPlugins(app)

// Provide messageChannel to communicate with service worker to all components
const messageChannel = new MessageChannel();
app.config.globalProperties.$messageChannel = messageChannel;

// --- NEW: listen on port1 for SW messages and log / persist state ---
messageChannel.port1.onmessage = (ev) => {
  const msg = ev.data || {};
  const type = msg.type || '(no-type)';
  switch (type) {
    case 'PORT_READY':
      console.log('[SW] PORT_READY');
      break;
    case 'NG_CACHE_INITIATED':
      console.log('[SW] NG_CACHE_INITIATED - discovery started');
      localStorage.setItem('ngCacheState', 'DISCOVERING');
      break;
    case 'NG_CACHE_PROGRESS':
      console.log('[SW] NG_CACHE_PROGRESS', { processed: msg.processed, total: msg.total });
      localStorage.setItem('ngCacheState', 'CACHING');
      break;
    case 'NG_CACHE_COMPLETED':
      console.log('[SW] NG_CACHE_COMPLETED - queue empty');
      localStorage.setItem('ngCacheState', 'IDLE');
      break;
    case 'NG_CACHE_INCOMPLETE':
      console.log('[SW] NG_CACHE_INCOMPLETE - queue has items (offline or abandoned)');
      localStorage.setItem('ngCacheState', 'INCOMPLETE');
      break;
    case 'NG_CACHE_STORAGE_FULL':
      console.error('[SW] NG_CACHE_STORAGE_FULL - storage full while caching');
      localStorage.setItem('ngCacheState', 'STORAGE_FULL');
      break;
    default:
      // generic logging for other/legacy messages
      console.log('[SW]', msg);
      break;
  }
};

app.use(i18n).mount('#app')

// Register sevice worker
if (import.meta.env.PROD) {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
            navigator.serviceWorker.ready
                .then((registration) => {
                    // Open communication channel
                    if (registration.active) {
                        registration.active.postMessage({ type: 'PORT_INITIALIZATION' }, [
                            messageChannel.port2,
                        ]);
                    } else if (registration.waiting) {
                        registration.waiting.postMessage({ type: 'PORT_INITIALIZATION' }, [
                            messageChannel.port2,
                        ]);
                    }
                    // try downloading and caching the data file
                    try {
                        fetch("/data/data.json");
                    }
                    catch {
                        console.log("Error downloading data file")
                    }
                });
        })

        // Listen to online/offline and inform SW
        window.addEventListener('online', async () => {
            try {
                const reg = await navigator.serviceWorker.ready;
                if (reg && reg.active) {
                    reg.active.postMessage({ type: 'NG_NETWORK_ONLINE' });
                }
            } catch (e) { /* ignore */ }
        });
        window.addEventListener('offline', async () => {
            try {
                const reg = await navigator.serviceWorker.ready;
                if (reg && reg.active) {
                    reg.active.postMessage({ type: 'NG_NETWORK_OFFLINE' });
                }
            } catch (e) { /* ignore */ }
        });
    }
}


if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then((persistent) => {
        if (persistent) {
            console.log("Storage will not be cleared except by explicit user action");
        } else {
            console.log("Storage may be cleared by the UA under storage pressure.");
        }
    });
}