import { createRouter, createWebHistory } from 'vue-router'

import Search from '@/views/Search.vue'
import Single from '@/views/Single.vue'
import Learning from '@/views/Learning.vue'
import AboutApp from '@/views/AboutApp.vue'
import AboutDictionary from '@/views/AboutDictionary.vue'
import Settings from '@/views/Settings.vue'

import { i18n, inferLocale, isLocaleSupported, setLocale } from "@/i18n"
import { useStorage } from '@vueuse/core'

const persistentTable = useStorage('selected-table', "", localStorage, { mergeDefaults: true })

const router = createRouter({
  routes: [
    {
      path: '/:locale?',
      redirect:
        (persistentTable.value ?
          { name: 'search', params: { locale: inferLocale(), table: persistentTable.value } } :
          { name: 'settings', params: { locale: inferLocale() } }
        )
    },
    {
      path: '/:locale/search/:table',
      name: 'search',
      component: Search,
    },
    {
      path: '/:locale/view/:singleViewTable/:singleViewId',
      name: 'view',
      component: Single,
    },
    {
      path: '/:locale/learn/:activity?',
      name: 'learning',
      component: Learning,
    },
    {
      path: '/:locale/aboutApp',
      name: 'aboutApp',
      component: AboutApp,
    },
    {
      path: '/:locale/aboutDictionary',
      name: 'aboutDictionary',
      component: AboutDictionary,
    },
    {
      path: '/:locale/settings',
      name: 'settings',
      component: Settings,
    }
  ],
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    return { top: 0 }
  },
})

router.beforeEach((to, from, next) => {

  const locale = to.params.locale; // Retrieve the current locale set in the URL

  if (locale === undefined) {
    return next()
  }

  if (!isLocaleSupported(locale)) {
    return next(i18n.global.locale.value);
  }

  // Changing the language from the URl (either manually or with a link) is possible this way
  setLocale(locale)

  if (to.params.table || to.params.singleViewTable) {
    persistentTable.value = to.params.table || to.params.singleViewTable
  }

  return next();
});

export default router