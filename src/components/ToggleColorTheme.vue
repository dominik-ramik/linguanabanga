<script setup>
import { useAppSettingsStore } from "@/store/AppSettingsStore.js";

const appSettings = useAppSettingsStore();
</script>

<template>
  <v-btn-toggle rounded="1" v-model="appSettings.uiTheme" color="primary" mandatory>
    <v-btn size="small" prepend-icon="mdi-weather-sunny" value="light"
      >Light</v-btn
    >
    <v-btn size="small" prepend-icon="mdi-theme-light-dark" value="system"
      >System</v-btn
    >
    <v-btn size="small" prepend-icon="mdi-weather-night" value="dark"
      >Dark</v-btn
    >
  </v-btn-toggle>
</template>
