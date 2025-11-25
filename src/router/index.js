import { createRouter, createWebHistory } from 'vue-router'

import SearchView from '@/views/SearchView.vue'
import SingleView from '@/views/SingleView.vue'
import LearningView from '@/views/LearningView.vue'
import AboutApp from '@/views/AboutApp.vue'
import AboutDictionary from '@/views/AboutDictionary.vue'
import SettingsView from '@/views/SettingsView.vue'
import LanguageSelectorView from '@/views/LanguageSelectorView.vue'

import { i18n, inferLocale, isLocaleSupported, setLocale } from "@/i18n"
import { useStorage } from '@vueuse/core'
import { useDictionaryStore } from '@/store/DictionaryStore'

// add persistent selected-projects storage (reliable during navigation)
const persistentTable = useStorage('selected-table', "", localStorage, { mergeDefaults: true })
const persistentSelectedProjects = useStorage('selected-projects', [], localStorage, { mergeDefaults: true })

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
    {
      path: '/:locale/select-dictionary',
      name: 'select-dictionary',
      component: LanguageSelectorView,
      meta: { requiresProjectsSelected: false },
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

  // Make sure path locale is supported or else get some sensible defaults
  if (!isLocaleSupported(pathLocale)) {
    pathLocale = inferLocale();
    to.params.locale = pathLocale
  }

  // Changing the language from the URL (either manually or with a link) is possible this way
  setLocale(pathLocale)

  // Save persistent table info
  if (to.params.table || to.params.singleViewTable) {
    persistentTable.value = to.params.table || to.params.singleViewTable
  }

  // --- NEW CHECK: ENFORCE DICTIONARY DATA ---
  // If the dictionary is not ready (loading failed, empty, or currently loading), 
  // force the user to the Settings -> Data Management page.
  
  // Robust readiness check: prefer store.isReady (unwrapped boolean) if available
  const isDictionaryReady = (typeof dictionaryStore.isReady !== 'undefined')
    ? Boolean(dictionaryStore.isReady)
    : (() => {
        const isReadyCandidate = dictionaryStore?.dictionary?.isReady;
        return (isReadyCandidate && typeof isReadyCandidate === 'object' && 'value' in isReadyCandidate)
          ? isReadyCandidate.value === true
          : Boolean(isReadyCandidate) === true;
      })();

  // Check if we are already heading to the Data Management tab to prevent infinite redirects
  const isTargetDataManagement = to.name === 'settings' && to.params.tabId === 'data-management';

  if (!isDictionaryReady && !isTargetDataManagement) {
    return { 
      name: 'settings', 
      params: { locale: pathLocale, tabId: 'data-management' } 
    }
  }
  // ------------------------------------------

  // Need to select language and projects first
  let goesToDictionarySelection =
    to.name == "select-dictionary" ||
    (to.name == "settings" && to.params?.tabId == "dictionary-selection")

  if (!goesToDictionarySelection && to.meta?.requiresProjectsSelected) {
    // Use persistent storage value (synchronous and reliable during routing)
    const selectedProjectsLength = Array.isArray(persistentSelectedProjects.value)
      ? persistentSelectedProjects.value.length
      : 0

    if (!(selectedProjectsLength > 0)) {
      // need to select at least one dictionary first
      return { name: "select-dictionary", params: { locale: pathLocale } }
    }
  }

  //return next();
});

export default router