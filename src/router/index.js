import { createRouter, createWebHistory } from 'vue-router'

import SearchView from '@/views/SearchView.vue'
import SingleView from '@/views/SingleView.vue'
import LearningView from '@/views/LearningView.vue'
import AboutApp from '@/views/AboutApp.vue'
import AboutDictionary from '@/views/AboutDictionary.vue'
import SettingsView from '@/views/SettingsView.vue'
import LanguageSelectorView from '@/views/LanguageSelectorView.vue'

import { inferLocale, isLocaleSupported, setLocale } from "@/i18n"
import { useStorage } from '@vueuse/core'
import { useDictionaryStore } from '@/store/DictionaryStore'

const persistentTable = useStorage('selected-table', "", localStorage, { mergeDefaults: true })

const router = createRouter({
  routes: [
    {
      path: '/:locale?',
      name: 'home',
      meta: { requiresProjectsSelected: false },
      redirect: () => {
        const locale = inferLocale();
        return persistentTable.value
          ? { name: 'search', params: { locale, table: persistentTable.value } }
          : { name: 'about-dictionary', params: { locale } }
      }
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

router.beforeEach((to) => {
  const dictionaryStore = useDictionaryStore();

  // Get locale from route or infer
  let pathLocale = to.params.locale;
  const inferredLocale = inferLocale();

  // Avoid mutating to.params directly; always redirect if locale is not supported
  if (!isLocaleSupported(pathLocale)) {
    // Only redirect if not already using the inferred locale
    if (pathLocale !== inferredLocale) {
      return {
        name: to.name,
        params: { ...to.params, locale: inferredLocale },
        query: to.query,
        hash: to.hash,
        replace: true
      }
    }
    // If still not supported, allow navigation to avoid deadlock
    setLocale(inferredLocale);
  } else {
    setLocale(pathLocale);
  }

  // Save persistent table info
  if (to.params.table || to.params.singleViewTable) {
    persistentTable.value = to.params.table || to.params.singleViewTable;
  }

  // Encapsulate logic for checking if a project is selected
  const requiresProjects = to.meta?.requiresProjectsSelected;
  const goesToDictionarySelection =
    to.name === "select-dictionary" ||
    (to.name === "settings" && to.params?.tabId === "dictionary-selection");

  const hasSelectedProjects =
    Array.isArray(dictionaryStore.filter?.selectedProjects) &&
    dictionaryStore.filter.selectedProjects.length > 0;

  //*
  // Redirect to dictionary selection if required and not selected
  if (requiresProjects && !goesToDictionarySelection && !hasSelectedProjects) {
    if (to.name !== "select-dictionary") {
      return { name: "select-dictionary", params: { locale: pathLocale || inferredLocale } }
    }
  }
  //  */

  // Always return a value
  return true;
});

export default router