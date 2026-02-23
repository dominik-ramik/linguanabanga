<script setup>
import { ref, computed, watch } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import DictionarySelectionPanel from "@/components/DictionarySelectionPanel.vue";

const dictionaryStore = useDictionaryStore();

// 1-based page index so that v-pagination can use it as its model
const currentPageIndex = ref(1);

const pageLength = ref(50);

//watch for results changes and paginate to the first page whenever they change
watch(
  () => dictionaryStore.filter.results,
  () => {
    currentPageIndex.value = 1;
  }
);

const totalPages = computed(() => {
  let allResults = dictionaryStore.filter.results;

  if (!allResults || allResults.length == 0) {
    return 0;
  } else {
    return Math.ceil(allResults.length / pageLength.value);
  }
});

const currentPageData = computed(() => {
  window.scrollTo({
    top: 0,
    left: 0,
  });
  
  let allResults = dictionaryStore.filter.results;
  
  let paginatedResults = allResults.slice(
    (currentPageIndex.value - 1) * pageLength.value,
    currentPageIndex.value * pageLength.value
  );

  return paginatedResults;
});

const hasSelectedProjects = computed(
  () => Array.isArray(dictionaryStore.filter?.selectedProjects) && dictionaryStore.filter.selectedProjects.length > 0
);
</script>

<template>
  <div>
    <DictionarySelectionPanel v-if="!hasSelectedProjects" />
    <template v-else>
      <div v-if="dictionaryStore.filter.results?.length == 0">
        Nothing found that would satisfy your query.
      </div>
      <div v-else>
        <TreefiedSearchResults :results="currentPageData" />
        <v-pagination
          v-if="totalPages > 1"
          v-model="currentPageIndex"
          :length="totalPages"
          density="default"
        ></v-pagination>
        <div class="d-flex justify-center text-caption">
          Found {{ dictionaryStore.filter.results?.length }} results
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.triangle {
  width: 32px;
  height: 32px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: left, right;
}
</style>
