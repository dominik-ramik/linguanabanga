<script setup>
import { ref, computed } from "vue";

import { useRouter, useRoute } from "vue-router";
import { useDictionaryStore } from "@/store/DictionaryStore";

const props = defineProps(["project", "languageCode"]);

const dictionaryStore = useDictionaryStore();

const preloadableAssetsInfo = computed(() => {
  let totalSize = 0;

  if (dictionaryStore.dictionary.preloadableAssets) {
    for (const asset of dictionaryStore.dictionary.preloadableAssets) {
      if (
        asset.referencedInLanguages.includes(props.languageCode) &&
        asset.referencedInProjects.includes(props.project.projectTag)
      ) {
        totalSize += asset.size;
      }
    }
  }

  let sizeMb = (totalSize / 1024.0 / 1024.0).toFixed(1);

  return { files: 5, sizeMb: sizeMb };
});
</script>

<template>
  <b>{{ props.project.projectName }}</b> Assets: [ {{ preloadableAssetsInfo.sizeMb }}Mb
  ]
</template>
