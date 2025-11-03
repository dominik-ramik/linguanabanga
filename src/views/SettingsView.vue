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
    <v-tab value="dictionary-selection" prepend-icon="mdi-web">Settings</v-tab>
    <v-tab value="data-management" prepend-icon="mdi-database-arrow-up"
      >Manage data</v-tab
    >
  </v-tabs>

  <v-tabs-window v-model="tab">
    <v-tabs-window-item value="dictionary-selection">
      <v-card class="pa-3 ma-1">
        <projects-selector></projects-selector>
      </v-card>
      <v-card class="ma-1">
        <div class="d-flex flex-column ma-5">
          <div class="text-h5 mb-4">Theme</div>
          <toggle-color-theme></toggle-color-theme>
          <div class="ma-4">Hint: use the dark mode when in the nakamal</div>
        </div>
      </v-card>
    </v-tabs-window-item>
    <v-tabs-window-item value="data-management">
      <spreadsheet-importer></spreadsheet-importer>
    </v-tabs-window-item>
  </v-tabs-window>
</template>
