<script setup>
import { useDictionaryStore } from "@/store/DictionaryStore";

const dictionaryStore = useDictionaryStore();
</script>

<template>
  <div>
    <project-offline-caching></project-offline-caching>

    <language-selection-dialog
      v-if="
        !dictionaryStore.cache.processQueue &&
        Object.keys(dictionaryStore.dictionary.allVersionsProjectsMeta).length > 1
      "
    ></language-selection-dialog>

    <cache-deletion v-if="!dictionaryStore.cache.processQueue"></cache-deletion>
  </div>
</template>
