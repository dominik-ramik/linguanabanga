/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

import '@/styles/settings.scss';

// Plugins
import { registerPlugins } from '@/plugins'
import {i18n} from '@/i18n'

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

const app = createApp(App)

registerPlugins(app)

app.use(i18n).mount('#app')