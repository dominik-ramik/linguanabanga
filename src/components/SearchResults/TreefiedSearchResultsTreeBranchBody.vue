<script setup>
import { computed } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore.js";

import { useLayout } from "@/composables/useLayout.js";
const dictionaryStore = useDictionaryStore();

const props = defineProps(["branchData", "collapsed", "itemIcon"]);

const searchResultLayout = computed(() => {
  const usedLayout = useLayout(
    dictionaryStore.dictionary,
    dictionaryStore.filter.table,
    "search-result"
  );

  return usedLayout;
});
</script>

<template>
  <div v-if="props.branchData.items">
    <DynamicDataCard
      v-for="(result, index) in props.branchData.items"
      :key="
        index +
        ':' +
        result.item.__meta.project?.projectTag +
        ':' +
        result.refIndex +
        ':' +
        dictionaryStore.filter.table
      "
      :icon="props.itemIcon"
      :data="result.item"
      :passThroughData="result"
      :cornerText="result.item.__meta.project?.languageName"
      :layout="searchResultLayout"
    />
  </div>
  <TreefiedSearchResultsTreeBranch
    v-for="(branchDataChild, index) in props.branchData.children"
    v-bind:key="index"
    :branchData="branchDataChild"
    :collapsed="props.collapsed"
    :itemIcon="props.itemIcon"
  />
</template>
