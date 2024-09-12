<script setup>
import { computed } from "vue";
import { useStorage } from "@vueuse/core";
import { useAppSettingsStore } from "@/store/AppSettingsStore.js";
import logoLight from "@/assets/logo.svg";
import logoDark from "@/assets/logo_dark.svg";

const appSettings = useAppSettingsStore();

const name = useStorage("portal-name", "", localStorage);
const logo = computed(() => {
  return appSettings.uiThemeIsDark ? logoDark : logoLight;
});
</script>

<template>
  <div
    id="loading-wrapper"
    class="d-flex align-center justify-center flex-column"
    style="background-color: rgb(var(--v-theme-primary))"
  >
    <v-img
      :width="300"
      aspect-ratio="1/1"
      cover
      :src="logo"
    ></v-img>
    <br />
    <p class="text-h4 mb-5" style="color: rgb(var(--v-theme-surface))">{{ name }}</p>
    <br />
    <div style="width: 100%">
      <v-progress-linear
        :active="true"
        indeterminate="true"
        color="surface"
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
