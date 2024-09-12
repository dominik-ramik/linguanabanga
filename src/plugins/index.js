/**
 * plugins/index.js
 *
 * Automatically included in `./src/main.js`
 */

// Plugins
import vuetify from './vuetify'
import pinia from '@/store'
import router from '@/router'
/*
pinia.use(({ store }) => {
    store.router = markRaw(router)
    store.route = markRaw(route)
})
*/

export function registerPlugins(app) {
  app.use(vuetify)
  app.use(router)
  app.use(pinia)
}
