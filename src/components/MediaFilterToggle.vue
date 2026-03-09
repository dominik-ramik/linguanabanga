<script setup>
import { computed } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore.js";

const dictionaryStore = useDictionaryStore();

// dictionaryStore.filter is already a reactive object (from storeToRefs in the store).
// Its properties are auto-unwrapped by Pinia's reactive proxy, so we can
// reference them directly — no extra .value needed in templates.
const mediaFilters = computed(() => {
  console.debug('[MediaFilterToggle] mediaFilters:', dictionaryStore.filter.mediaFilters);
  return dictionaryStore.filter.mediaFilters;
});
const hasMediaFiltersAvailable = computed(() => {
  const val = dictionaryStore.filter.hasMediaFiltersAvailable;
  console.debug('[MediaFilterToggle] hasMediaFiltersAvailable:', val);
  return val;
});
const currentMediaLayoutPaths = computed(() => {
  const val = dictionaryStore.filter.currentMediaLayoutPaths;
  console.debug('[MediaFilterToggle] currentMediaLayoutPaths:', val);
  return val;
});

function setAudio(value) {
  console.debug('[MediaFilterToggle] setAudio:', value);
  dictionaryStore.filter.mediaFilters.audio = value;
}
function setImage(value) {
  console.debug('[MediaFilterToggle] setImage:', value);
  dictionaryStore.filter.mediaFilters.image = value;
}

const options = [
  { title: "Show All", value: "all" },
  { title: "Only With", value: "with" },
  { title: "Only Without", value: "without" },
];
</script>

<template>
  <div
    v-if="hasMediaFiltersAvailable"
    class="d-flex gap-4 flex-wrap align-center"
  >
    <div
      v-if="currentMediaLayoutPaths?.audio?.length > 0"
      class="d-flex align-center gap-2"
    >
      <v-icon size="small" icon="mdi-volume-high" />
      <v-btn-toggle
        :model-value="mediaFilters?.audio"
        @update:model-value="setAudio"
        mandatory
        density="compact"
        variant="outlined"
        divided
        color="primary"
      >
        <v-btn
          v-for="opt in options"
          :key="opt.value"
          :value="opt.value"
          size="small"
        >
          {{ opt.title }}
        </v-btn>
      </v-btn-toggle>
    </div>

    <div
      v-if="currentMediaLayoutPaths?.image?.length > 0"
      class="d-flex align-center gap-2"
    >
      <v-icon size="small" icon="mdi-image-outline" />
      <v-btn-toggle
        :model-value="mediaFilters?.image"
        @update:model-value="setImage"
        mandatory
        density="compact"
        variant="outlined"
        divided
        color="primary"
      >
        <v-btn
          v-for="opt in options"
          :key="opt.value"
          :value="opt.value"
          size="small"
        >
          {{ opt.title }}
        </v-btn>
      </v-btn-toggle>
    </div>
  </div>
</template>
