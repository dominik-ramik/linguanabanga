import { createRouter, createWebHistory } from 'vue-router'

import SearchView from '@/views/SearchView.vue'
import SingleView from '@/views/SingleView.vue'
import LearningView from '@/views/LearningView.vue'
import AboutApp from '@/views/AboutApp.vue'
import AboutDictionary from '@/views/AboutDictionary.vue'
import SettingsView from '@/views/SettingsView.vue'

import { i18n, inferLocale, isLocaleSupported, setLocale } from "@/i18n"
import { useStorage } from '@vueuse/core'
import { useDictionaryStore } from '@/store/DictionaryStore'

const persistentTable = useStorage('selected-table', "", localStorage, { mergeDefaults: true })

const router = createRouter({
  routes: [
    {
      path: '/:locale?',
      name: 'home',
      meta: { requiresProjectsSelected: false },
      redirect:
        (persistentTable.value ?
          { name: 'search', params: { locale: inferLocale(), table: persistentTable.value } } :
          { name: 'about-dictionary', params: { locale: inferLocale() } }
        )
    },
    {
      path: '/:locale/search/:table',
      name: 'search',
      component: SearchView,
      meta: { requiresProjectsSelected: true },
    },
    {
      path: '/:locale/view/:singleViewTable/:singleViewId',
      name: 'view',
      component: SingleView,
      meta: { requiresProjectsSelected: true },
    },
    {
      path: '/:locale/learn/:activity?',
      name: 'learning',
      component: LearningView,
      meta: { requiresProjectsSelected: true },
    },
    {
      path: '/:locale/about-app',
      name: 'about-app',
      component: AboutApp,
      meta: { requiresProjectsSelected: false },
    },
    {
      path: '/:locale/',
      name: 'about-dictionary',
      component: AboutDictionary,
      meta: { requiresProjectsSelected: false },
    },
    {
      path: '/:locale/settings/:tabId?',
      name: 'settings',
      component: SettingsView,
      meta: { requiresProjectsSelected: false },
      props: true,
    },
  ],
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to, from) => {

  const dictionaryStore = useDictionaryStore();
  
  // Retrieve the current locale set in the URL
  let pathLocale = to.params.locale;

  // Make sure path locale is supportedd or else get some sensible defaults
  if (!isLocaleSupported(pathLocale)) {
    pathLocale = inferLocale();
    to.params.locale = pathLocale
  }

  // Changing the language from the URl (either manually or with a link) is possible this way
  setLocale(pathLocale)

  // Save persistent table info
  if (to.params.table || to.params.singleViewTable) {
    persistentTable.value = to.params.table || to.params.singleViewTable
  }

  // Need to select language and projects first
  let goesToDictionarySelection = to.name == "settings" && to.params?.tabId == "dictionary-selection"

  if (!goesToDictionarySelection && to.meta?.requiresProjectsSelected) {
    if (!dictionaryStore.filter?.selectedProjects?.length > 0) {
      //need to select language and projects first
      return { name: "settings", params: { locale: pathLocale, tabId: "dictionary-selection" } }
    }
  }

  //return next();
});

export default router