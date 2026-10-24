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
import { registerServiceWorker, applyWaitingUpdateOnStartup } from '@/composables/useServiceWorkerUpdate.js'
import { refreshDictionary } from '@/composables/useDictionary.js'

// Composables
import { createApp } from 'vue'

const app = createApp(App)
registerPlugins(app)

// Provide messageChannel to communicate with service worker to all components
const messageChannel = new MessageChannel();
app.config.globalProperties.$messageChannel = messageChannel;

// Listen for SW messages via navigator.serviceWorker (Clients API)
// This works reliably even after page refresh without depending on MessagePort setup timing
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (ev) => {
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
      case 'CACHE_UPDATED': {
        // workbox-broadcast-update: the service worker's background revalidation of data.json found a newer file than the copy it
        // served to the page. Load it now instead of waiting for the next page load.
        let updatedPath = ''
        try { updatedPath = new URL(msg.payload && msg.payload.updatedURL, location.origin).pathname } catch (e) { /* ignore */ }
        if (msg.meta === 'workbox-broadcast-update' && updatedPath === '/data/data.json') {
          console.log('[SW] data.json changed on the server - reloading the dictionary');
          refreshDictionary();
        }
        break;
      }
      default:
        break;
    }
  });
}

// Was this page already controlled by a service worker when it loaded? If so, the app's own request for data.json went through
// the worker (and was cached by it). Only on a first visit the page's request bypassed the worker and the cache must be seeded.
const wasControlledAtStart = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller

function warmUpDataFile() {
    const download = () => fetch('/data/data.json').catch(() => { console.log('Error downloading data file') })
    if (navigator.serviceWorker.controller) { download(); return }
    // wait until the new worker has claimed this page, otherwise the request would bypass it and nothing would be cached
    let started = false
    const go = () => { if (started) return; started = true; download() }
    navigator.serviceWorker.addEventListener('controllerchange', go, { once: true })
    setTimeout(go, 5000)
}

let mounted = false
function mountApp() {
  if (mounted) return
  mounted = true
  app.use(i18n).mount('#app')
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // An update that finished installing while the app was open (or before this load) is applied now, BEFORE the app
  // mounts: the waiting worker takes over and the page reloads straight into the new version. If nothing is waiting
  // this resolves immediately and the app starts as usual.
  applyWaitingUpdateOnStartup().then((reloading) => { if (!reloading) mountApp() }).catch(mountApp)
  setTimeout(mountApp, 6000) // failsafe, never leave a blank page
} else {
  mountApp()
}

// Register sevice worker
if (import.meta.env.PROD) {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            registerServiceWorker() // registers, watches for new versions and checks for them periodically (see useServiceWorkerUpdate.js)
            navigator.serviceWorker.ready
                .then((registration) => {
                    // Open communication channel
                    if (registration.active) {
                                console.log('[main] sending PORT_INITIALIZATION to active SW');
                                registration.active.postMessage({ type: 'PORT_INITIALIZATION' }, [
                                    messageChannel.port2,
                                ]);
                    } else if (registration.waiting) {
                                console.log('[main] sending PORT_INITIALIZATION to waiting SW');
                                registration.waiting.postMessage({ type: 'PORT_INITIALIZATION' }, [
                                    messageChannel.port2,
                                ]);
                    }
                    // first visit only: download and cache the data file through the service worker
                    if (!wasControlledAtStart) warmUpDataFile()
                });
        })

        // Listen to online/offline and inform SW
        window.addEventListener('online', async () => {
            try {
                const reg = await navigator.serviceWorker.ready;
                if (reg && reg.active) {
                    console.log('[main] posting NG_NETWORK_ONLINE to SW');
                    reg.active.postMessage({ type: 'NG_NETWORK_ONLINE' });
                }
            } catch (e) { /* ignore */ }
        });
        window.addEventListener('offline', async () => {
            try {
                const reg = await navigator.serviceWorker.ready;
                if (reg && reg.active) {
                    console.log('[main] posting NG_NETWORK_OFFLINE to SW');
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