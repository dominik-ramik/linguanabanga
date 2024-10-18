<script setup>
import { ref, computed } from "vue";
import { RouterView } from "vue-router";
import { useDisplay } from "vuetify";
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import SplashScreen from "@/views/SplashScreen.vue";
import { useRoute } from "vue-router";
import { useAppSettingsStore } from "@/store/AppSettingsStore.js";

import logoLight from "@/assets/logo.svg";
import logoDark from "@/assets/logo_dark.svg";

const logo = computed(() => {
  return appSettings.uiThemeIsDark ? logoLight : logoDark;
});

const appSettings = useAppSettingsStore();

//load dictionary data
const dictionaryStore = useDictionaryStore();

const { mobile } = useDisplay();

const loadingDelay = ref(0);
const route = useRoute();

let maxTimeout = 2500; //flicker prevention for splash
let intervalStep = 100;

maxTimeout = 3500; //TODO remove in production

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

const showSidebar = ref(false);

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
</script>

<template>
  <v-app
    v-if="!dictionaryStore.dictionary.isReady || loadingDelay < maxTimeout"
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

      <v-btn
        v-if="mobile && route.meta.requiresProjectsSelected"
        icon
        @click.stop="toggleSidebar()"
      >
        <v-badge
          color="error"
          :content="dictionaryStore.filter.activeFilters.length"
          :model-value="dictionaryStore.filter.activeFilters.length > 0"
        >
          <v-icon color="surface">mdi-binoculars</v-icon>
        </v-badge>
      </v-btn>
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
    <v-bottom-navigation v-if="mobile && route.name == 'search'">
      <search-box
        :filterObject="dictionaryStore.filter.text"
        :specialCharacters="dictionaryStore.dictionary.specialCharacters.all"
      ></search-box>
    </v-bottom-navigation>

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
