<script setup>
import { ref, watch } from "vue";
import router from "@/router";
const props = defineProps(["tabId"]);
const tab = ref(props.tabId ? props.tabId : null);

watch(
  () => tab.value,
  (newValue) => {
    router.push({ name: "settings", params: { tabId: newValue } });
  }
);
</script>

<template>
  <v-tabs v-model="tab" align-tabs="center">
    <v-tab value="dictionary-selection" prepend-icon="mdi-web"
      >Language and projects</v-tab
    >
    <v-tab value="theme" prepend-icon="mdi-theme-light-dark">Color theme</v-tab>
    <v-tab value="data-management" prepend-icon="mdi-database-arrow-up"
      >Manage data</v-tab
    >
  </v-tabs>

  <v-card class="pa-3">
    <v-tabs-window v-model="tab">
      <v-tabs-window-item value="dictionary-selection">
        <projects-selector></projects-selector>
      </v-tabs-window-item>
      <v-tabs-window-item value="theme">
        <div class="d-flex align-center flex-column ma-5">
          <toggle-color-theme></toggle-color-theme>
          <div class="text-captionx ma-4">
            Hint: use the dark mode when in the nakamal
          </div>
        </div>
      </v-tabs-window-item>
      <v-tabs-window-item value="data-management">
        <spreadsheet-importer></spreadsheet-importer>
      </v-tabs-window-item>
    </v-tabs-window>
  </v-card>
</template>
