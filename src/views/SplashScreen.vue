<script setup>
import { computed } from "vue";
import { useStorage } from "@vueuse/core";
import { useAppSettingsStore } from "@/store/AppSettingsStore.js";
import logoLightTheme from "@/assets/logo_blue.svg";
import logoDarkTheme from "@/assets/logo_light.svg";

const appSettings = useAppSettingsStore();

const name = useStorage("portal-name", "", localStorage);
const logo = computed(() => {
  return appSettings.uiThemeIsDark ?  logoDarkTheme : logoLightTheme;
});
</script>

<template>
  <div
    id="loading-wrapper"
    class="d-flex align-center justify-center flex-column"
    :style="'background-color: rgb(var(--v-theme-' + (appSettings.uiThemeIsDark ? 'surface' : 'surface') + '))'"
  >
    <v-img
      :width="300"
      aspect-ratio="1/1"
      cover
      :src="logo"
    ></v-img>
    <br />
    <p class="text-h4 mb-5" style="color: rgb(var(--v-theme-primary))">{{ name }}</p>
    <br />
    <div style="width: 100%">
      <v-progress-linear
        :active="true"
        indeterminate="true"
        color="primary"
        height="10"
      ></v-progress-linear>
    </div>
  </div>
</template>

<style>
#loading-wrapper {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  padding-top: 30vh;
  padding-bottom: 20vh;
  text-align: center;
}
</style>
