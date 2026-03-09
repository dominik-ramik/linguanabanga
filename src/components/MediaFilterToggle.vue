<script setup>
import { computed } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import MediaTypeToggle from "@/components/MediaTypeToggle.vue";

const dictionaryStore = useDictionaryStore();

const mediaFilters = computed(() => dictionaryStore.filter.mediaFilters);
const hasMediaFiltersAvailable = computed(
  () => dictionaryStore.filter.hasMediaFiltersAvailable
);
const currentMediaLayoutPaths = computed(
  () => dictionaryStore.filter.currentMediaLayoutPaths
);

function setAudio(value) {
  console.debug("[MediaFilterToggle] setAudio:", value);
  dictionaryStore.filter.mediaFilters.audio = value;
}
function setImage(value) {
  console.debug("[MediaFilterToggle] setImage:", value);
  dictionaryStore.filter.mediaFilters.image = value;
}

const audioOptions = [
  { title: "All entries", value: "all" },
  { title: "With audio", value: "with" },
  { title: "Without audio", value: "without" },
];

const imageOptions = [
  { title: "All entries", value: "all" },
  { title: "With images", value: "with" },
  { title: "Without images", value: "without" },
];
</script>

<template>
  <div
    v-if="hasMediaFiltersAvailable"
    class="d-flex flex-column gap-2"
  >
    <MediaTypeToggle
      v-if="currentMediaLayoutPaths?.audio?.length > 0"
      icon="mdi-volume-high"
      label="Audio filter"
      :model-value="mediaFilters?.audio"
      :options="audioOptions"
      @update:model-value="setAudio"
    />
    <MediaTypeToggle
      v-if="currentMediaLayoutPaths?.image?.length > 0"
      icon="mdi-image-outline"
      label="Image filter"
      :model-value="mediaFilters?.image"
      :options="imageOptions"
      @update:model-value="setImage"
    />
  </div>
</template>
