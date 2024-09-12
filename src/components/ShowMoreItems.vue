<script setup>
import { ref, computed } from "vue";

const props = defineProps(["items", "maxItemsShown"]);

const permanentItems = computed(() => {
  return props.items.slice(0, props.maxItemsShown);
});

const remainingItems = computed(() => {
  if (props.items.length > props.maxItemsShown) {
    return props.items.slice(props.maxItemsShown);
  } else {
    return [];
  }
});

const opened = ref(false);

function toggleOpened() {
  opened.value = !opened.value;
}
</script>

<template>
  <div>
    <slot
      v-for="(item, key, index) in permanentItems"
      :currentItem="item"
      :content="props.items"
    ></slot>
  </div>
  <div v-if="remainingItems.length > 0">
    <div v-if="!opened">
      <v-btn
        @click="toggleOpened"
        size="x-small"
        color="primary"
        variant="plain"
        prepend-icon="mdi-plus"
        density="compact"
        >And {{ remainingItems.length }} more items</v-btn
      >
    </div>
    <div v-else>
      <slot
        v-for="(item, key, index) in remainingItems"
        :currentItem="item"
        :content="props.items"
      ></slot>
      <v-btn
        @click="toggleOpened"
        size="x-small"
        color="primary"
        variant="plain"
        prepend-icon="mdi-minus"
        density="compact"
        >Show less</v-btn
      >
    </div>
  </div>
</template>
