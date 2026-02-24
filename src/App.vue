<script setup>
import { ref, computed, watch, unref, onMounted, onUnmounted } from "vue";
import { RouterView } from "vue-router";
import { useDisplay } from "vuetify";
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import SplashScreen from "@/views/SplashScreen.vue";
import { useRoute, useRouter } from "vue-router";
import { useAppSettingsStore } from "@/store/AppSettingsStore.js";
import { inferLocale } from "@/i18n";
import { useI18n } from "vue-i18n";
import DictionaryFilter from "@/components/DictionaryFilter.vue";

import logoLightTheme from "@/assets/logo.svg";
import logoDarkTheme from "@/assets/logo_dark.svg";

const logo = computed(() => {
  return appSettings.uiThemeIsDark ? logoDarkTheme : logoLightTheme;
});

const appSettings = useAppSettingsStore();
const { t } = useI18n();

//load dictionary data
const dictionaryStore = useDictionaryStore();
const router = useRouter();

// Navigate to settings if data failed to load
watch(
  () => dictionaryStore.loadFailed,
  (failed) => {
    if (failed) {
      router.push({
        name: "settings",
        params: { locale: inferLocale(), tabId: "data-management" },
      });
    }
  },
);

const { mobile } = useDisplay();

const loadingDelay = ref(0);
const route = useRoute();

let maxTimeout = 2500; //flicker prevention for splash
let intervalStep = 100;

maxTimeout = 500; //TODO remove in production

let delayTimeout = window.setInterval(() => {
  loadingDelay.value += intervalStep;
  if (loadingDelay.value > maxTimeout) {
    clearTimeout(delayTimeout);
  }
}, intervalStep);

const showMenu = ref(!mobile.value);
function toggleMenu() {
  showMenu.value = !showMenu.value;
  if (showMenu.value) {
    showSidebar.value = false;
  }
}

function toggleSidebar() {
  showSidebar.value = !showSidebar.value;
  if (showSidebar.value) {
    showMenu.value = false;
  }
}

const showMobileFilters = ref(true);
const showSidebar = ref(false);

function toggleMobileFilters(event) {
  showMobileFilters.value = !showMobileFilters.value;
}

// --- NEW MOBILE BEHAVIOR LOGIC ---

function handleGlobalScroll(event) {
  if (!showMobileFilters.value) return;

  // Ignore scrolls that happen INSIDE the filters panel

  if (event.target === document) {
    showMobileFilters.value = false;
  }
}

onMounted(() => {
  // 1. Initial Discovery: Open filters by default if there's no text query and no active filters yet.
  if (
    !dictionaryStore.filter.text &&
    dictionaryStore.filter.activeFilters.length === 0
  ) {
    showMobileFilters.value = true;
  }

  // 2. Scroll Awareness: Listen to scroll on capture phase to catch all scrolling elements
  window.addEventListener("scroll", handleGlobalScroll, true);
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleGlobalScroll, true);
});

// ---------------------------------

const isCaching = computed(
  () => !!unref(dictionaryStore.cache?.queueBeingProcessed),
);
const cachingProgress = computed(() =>
  Math.round(unref(dictionaryStore.cache?.downloadProgress) || 0),
);

const shouldShowPanel = computed({
  get() {
    return (
      (route.name == "search" || route.name == "view") &&
      ((mobile.value && showSidebar.value) || !mobile.value)
    );
  },
  // setter
  set(newValue) {
    showSidebar.value = newValue;
  },
});

function getActiveFilterLabels(filterKey) {
  const currentFilters = unref(dictionaryStore.filter.currentFilters) || [];
  const filterInfo = currentFilters.find((f) => f.name == filterKey);
  const selectedValues = unref(dictionaryStore.filter.filters)[filterKey] || [];

  if (!Array.isArray(selectedValues) || selectedValues.length === 0) return "";

  if (!filterInfo || !filterInfo.items) {
    return selectedValues;
  }

  const titles = selectedValues.map((val) => {
    const found = filterInfo.items.find((it) => it.value == val);
    return found ? found.title : val;
  });

  return titles;
}

function getFilterChipText(filterKey) {
  const currentFilters = unref(dictionaryStore.filter.currentFilters) || [];
  const filterInfo = currentFilters.find((f) => f.name == filterKey);
  const labels = getActiveFilterLabels(filterKey);

  /**
   * Truncates a string in the middle while maximizing the preserved characters 
   * based on the provided limit.
   */
  const truncateMiddle = (str, limit) => {
    if (!str || str.length <= limit) return str;

    const ellipsis = "...";
    // Ensure we don't try to truncate if the limit is too small for an ellipsis
    if (limit <= ellipsis.length) return str.substring(0, limit);

    // Calculate how many characters we can keep on each side
    const availableChars = limit - ellipsis.length;
    const startChars = Math.ceil(availableChars / 2);
    const endChars = Math.floor(availableChars / 2);

    return str.substring(0, startChars) + ellipsis + str.substring(str.length - endChars);
  };

  let finalText = "";

  if (filterInfo && filterInfo.title) {
    if (labels && labels.length > 0) {
      // Normalize labels into an array, then pass the last '/' segment (trimmed)
      const labelsArray = Array.isArray(labels)
        ? labels
        : String(labels)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

      const processedLabels = labelsArray.map((l) => {
        const lastSeg = String(l).split("/").pop().trim();
        return truncateMiddle(lastSeg, 15);
      });

      finalText = `${filterInfo.title}: ${truncateMiddle(processedLabels.join(", "), 50)}`;
    } else {
      finalText = filterInfo.title;
    }
  }

  // The entire chip gets up to 50 characters, maximizing readability
  return finalText;
}

function removeFilterGroup(filter) {
  const key = filter.name || filter;
  if (!dictionaryStore.filter.filters) return;
  if (dictionaryStore.filter.filters[key]) {
    delete dictionaryStore.filter.filters[key];
  }
}
</script>

<template>
  <v-app
    v-if="
      (!dictionaryStore.dictionary.isReady && !dictionaryStore.loadFailed) ||
      loadingDelay < maxTimeout
    "
  >
    <SplashScreen v-if="true" />
    <!-- TODO remove in production -->
  </v-app>

  <v-app v-else>
    <v-app-bar app color="primary">
      <v-img
        v-if="mobile"
        class="mr-2"
        cover
        style="
          width: 110px;
          height: 110px;
          opacity: 0.2;
          position: absolute;
          left: -22px;
          top: 0px;
          z-index: -100;
          opacity: 0.2;
        "
        :src="logo"
      ></v-img>
      <template v-slot:prepend v-if="mobile">
        <v-app-bar-nav-icon
          color="surface"
          @click="toggleMenu()"
        ></v-app-bar-nav-icon>
      </template>

      <v-app-bar-title>
        <div
          style="color: rgb(var(--v-theme-surface))"
          class="d-flex flex-direction-row flex-nowrap align-center"
        >
          <v-img
            v-if="!mobile"
            max-width="40"
            max-heigh="40"
            class="mr-2"
            contain
            :src="logo"
          ></v-img>
          {{
            dictionaryStore.dictionary.portalName ||
            $route.meta.title ||
            "Default title"
          }}
        </div>
      </v-app-bar-title>

      <search-box
        class="mr-3"
        :filterObject="dictionaryStore.filter.text"
        :specialCharacters="dictionaryStore.dictionary.specialCharacters.all"
        v-if="!mobile && route.name == 'search'"
      ></search-box>
      <template v-slot:append>
        <div v-if="isCaching" class="d-flex align-center mr-2" style="gap: 8px">
          <v-progress-circular
            :model-value="cachingProgress"
            :size="32"
            :width="3"
            color="surface"
          ></v-progress-circular>
          <div
            class="d-flex flex-column"
            style="color: rgb(var(--v-theme-surface)); line-height: 1.2"
          >
            <span class="text-caption font-weight-medium"
              >{{ cachingProgress }}%</span
            >
            <span v-if="!mobile" class="text-caption" style="opacity: 0.8">{{
              t("languageSelectorView.preparingOffline")
            }}</span>
          </div>
        </div>

        <v-btn
          v-if="mobile && route.meta.requiresProjectsSelected"
          icon
          @click.stop="toggleSidebar()"
        >
          <v-icon color="surface">mdi-dots-vertical</v-icon>
        </v-btn>
      </template>
    </v-app-bar>

    <v-navigation-drawer app fixed v-model="showMenu">
      <main-menu></main-menu>
    </v-navigation-drawer>

    <div class="d-flex justify-center">
      <v-main
        id="main-area"
        class="ma-1"
        :style="mobile ? '' : 'max-width: 1350px'"
      >
        <router-view></router-view>
      </v-main>
    </div>

    <v-footer
      app
      v-if="mobile && route.name == 'search'"
      class="bg-surface d-flex flex-column pa-0"
      style="height: auto !important; z-index: 1004"
      elevation="8"
    >
      <div
        style="
          height: auto !important;
          display: flex !important;
          flex-direction: column !important;
          flex-wrap: nowrap !important;
          width: 100% !important;
        "
      >
        <v-expand-transition>
          <div
            v-if="showMobileFilters"
            class="bg-surface d-flex flex-column elevation-8"
            style="
              max-height: 45vh;
              width: 100% !important;
              border-bottom: 1px solid rgba(128, 128, 128, 0.2);
            "
          >
            <div
              class="pa-2 pb-10 pt-0 overflow-y-auto flex-grow-1 filters-scroll-area"
            >
              <div class="d-flex flex-column mt-4">
                <DictionaryFilter
                  v-for="filterInfo in dictionaryStore.filter.currentFilters"
                  v-bind:key="filterInfo.name"
                  v-model="dictionaryStore.filter.filters[filterInfo.name]"
                  :title="filterInfo.title"
                  :items="filterInfo.items"
                  :filterInfo="filterInfo"
                ></DictionaryFilter>
              </div>

              <div
                class="pt-2 pl-2 pr-2 pb-2 d-flex mb-2 mt-4"
                style="
                  gap: 12px;
                  position: fixed;
                  bottom: 50px;
                  right: 0px;
                  left: 0px;
                  z-index: 10000 !important;
                "
                v-if="dictionaryStore.filter.activeFilters.length > 0"
              >
                <v-btn
                  @click="showMobileFilters = false"
                  variant="elevated"
                  color="primary"
                  class="flex-grow-1"
                >
                  {{ t("ui.applyAndClose") }}
                </v-btn>
                <v-btn
                  @click="
                    dictionaryStore.setFilters();
                    showMobileFilters = false;
                  "
                  variant="elevated"
                  color="error"
                  class="flex-grow-1"
                >
                  {{ t("ui.clearAll") }}
                </v-btn>
              </div>
            </div>
          </div>
        </v-expand-transition>

        <div
          v-if="
            !showMobileFilters &&
            dictionaryStore.filter.activeFilters.length > 0
          "
          class="w-100 px-2 pt-2 pb-0 d-flex flex-wrap align-center bg-surface"
          style="gap: 8px; white-space: nowrap"
        >
          <v-chip
            v-for="filter in dictionaryStore.filter.activeFilters"
            :key="filter.name || filter"
            size="small"
            color="primary"
            variant="tonal"
            closable
            @click.stop="removeFilterGroup(filter)"
            @click:close.stop="removeFilterGroup(filter)"
          >
            {{ getFilterChipText(filter.name || filter) }}
          </v-chip>
        </div>

        <div class="w-100 pa-2 d-flex flex-column shrink-0 bg-surface">
          <search-box
            :filterObject="dictionaryStore.filter.text"
            :specialCharacters="
              dictionaryStore.dictionary.specialCharacters.all
            "
            @toggle-filters="toggleMobileFilters"
            @input-focus="showMobileFilters = false"
          ></search-box>
        </div>
      </div>
    </v-footer>

    <v-navigation-drawer
      v-model="shouldShowPanel"
      v-bind:width="450"
      app
      fixed
      :location="mobile ? 'right' : 'right'"
      class="pa-2"
    >
      <ActionsPanel :type="route.name" />
    </v-navigation-drawer>
  </v-app>
</template>

<style>
html {
  overflow: hidden;
}

/* Vuetify’s reset sets p { margin: 0 }. Restore margins in the main area only. */
#main-area p {
  margin: 1em 0;
}

span.markdown {
  display: block;
  max-width: 600px;
}
span.markdown p {
  margin-bottom: 1em !important;
}
span.markdown img {
  max-width: 100% !important;
}

span.markdown h1,
span.markdown h2,
span.markdown h3,
span.markdown h4 {
  line-height: 170%;
}

span.markdown ul,
span.markdown ol {
  margin-left: 30px;
  margin-bottom: 1em !important;
}

@media print {
  .v-toolbar {
    display: none !important;
    visibility: hidden !important;
  }
  .v-navigation-drawer {
    display: none !important;
    visibility: hidden !important;
  }
  main.v-main {
    min-width: 30cm !important;
    width: 30cm !important;
  }

  .audio-button {
    display: none !important;
    visibility: hidden !important;
  }

  .v-sheet.triangle {
    display: none !important;
    visibility: hidden !important;
  }
}
</style>
