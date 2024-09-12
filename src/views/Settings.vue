<script setup>
import { ref, computed } from "vue";

import { useDictionaryStore } from "@/store/DictionaryStore";

const dictionaryStore = useDictionaryStore();

const tab = ref(null);

const preloadableAssetsSize = computed(() => {
  let totalSize = 0;

  if (dictionaryStore.dictionary.preloadableAssets) {
    dictionaryStore.dictionary.allVersionsProjectsMeta;
    for (const asset of dictionaryStore.dictionary.preloadableAssets) {
      totalSize += asset.size;
    }
  }

  let sizeMb = (totalSize / 1024.0 / 1024.0).toFixed(1);

  return { files: 5, sizeMb: sizeMb };
});
</script>

<template>
  <v-tabs v-model="tab" align-tabs="center">
    <v-tab value="projects">Language and projects</v-tab>
    <v-tab value="theme">Theme</v-tab>
    <v-tab value="offline">Offline use</v-tab>
    <v-tab value="data">Data</v-tab>
  </v-tabs>

  <v-card class="pa-3">
    <v-tabs-window v-model="tab">
      <v-tabs-window-item value="projects">
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
      <v-tabs-window-item value="offline">
        Offline functionality is not yet fully implemented. When downloaded, the
        app will require <b>{{ preloadableAssetsSize.sizeMb }} Mb</b> of storage
        as per the currently used assets.
      </v-tabs-window-item>
      <v-tabs-window-item value="data">
        <spreadsheet-importer></spreadsheet-importer>
      </v-tabs-window-item>
    </v-tabs-window>
  </v-card>
</template>
