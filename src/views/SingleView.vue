<script setup>
import { watch, toRef, computed } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import { useRouter, useRoute } from "vue-router";

import { useLayout } from "@/composables/useLayout.js";
const dictionaryStore = useDictionaryStore();

const router = useRouter();
const route = useRoute();

const layout = computed(() => {
  const usedLayout = useLayout(
    dictionaryStore.dictionary,
    toRef(route.params.singleViewTable),
    "single"
  );

  return usedLayout;
});

const dataItem = computed(() => {
  let found = dictionaryStore.findItem(
    route.params.singleViewTable,
    route.params.singleViewId
  );
  return found;
});

watch(
  () => [dictionaryStore.filter.text, dictionaryStore.filter.filters],
  (newValue, oldValue) => {
    if (JSON.stringify(oldValue) == JSON.stringify(newValue)) {
      return;
    }

    router.push({
      name: "search",
      params: { table: dictionaryStore.filter.table },
      query: { q: dictionaryStore.serializeDictionaryFilter() },
    });
  },
  { deep: true }
);
</script>

<style scoped>
.triangle {
  width: 32px;
  height: 32px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: left, right;
}
</style>

<template>
  <v-divider />
  <DynamicDataCard v-if="dataItem" :data="dataItem" :layout="layout" />
  <div v-else>
    Could not find '{{ route.params.singleViewId }}' in '{{
      route.params.singleViewTable
    }}'
  </div>
</template>
