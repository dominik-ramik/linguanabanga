<script setup>
import { ref, computed } from "vue";

const props = defineProps(["src", "additionalData", "additionalLayout"]);

const imageUrls = computed(() => {
  if (Array.isArray(props.src)) {
    return props.src;
  } else {
    return [props.src];
  }
});

const currentFullSizeImageIndex = ref(0);
const currentFullSizeImage = computed(() => {
  return imageUrls.value[currentFullSizeImageIndex.value];
});

const showDialog = ref(false);

function showImage(index) {
  currentFullSizeImageIndex.value = index;
  showDialog.value = true;
}

//todo implement arrow keys left right
</script>

<template>
  <v-dialog
    v-model="showDialog"
    max-width="100vw"
    max-height="100vh"
    style="background-color: rgba(0, 0, 0, 0.9)"
    @click="showDialog = false"
  >
    <v-img :src="currentFullSizeImage" max-height="95vh" max-width="95vw" />
    <div
      v-if="props.additionalLayout?.properties && props.additionalData"
      style="
        display: flex;
        justify-content: center;
        position: absolute;
        bottom: 0px;
        left: 0px;
        right: 0px;
        z-index: 9999;
        background-color: rgba(var(--v-theme-surface), 0.7);
      "
    >
      <DynamicDataContainer
        v-for="(layout, index) in props.additionalLayout?.properties"
        v-bind:key="index"
        :currentData="props.additionalData"
        :layout="layout"
      />
    </div>
  </v-dialog>

  <template v-for="(imageUrl, index) in imageUrls" v-bind:key="imageUrl">
      <v-img
        :src="imageUrl"
        class="ma-1"
        cover
        style="display: inline-block; width: 6em; height: 6em"
        @click="showImage(index)"
      ></v-img>
  </template>
</template>
