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

app.use(i18n).mount('#app')

// Register sevice worker
if (import.meta.env.PROD) {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
            navigator.serviceWorker.ready
                .then((registration) => {
                    // Open communication channel
                    registration.active.postMessage({ type: 'PORT_INITIALIZATION' }, [
                        messageChannel.port2,
                    ]);
                });
        })
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