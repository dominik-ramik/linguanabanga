<script setup>
import { ref, computed } from "vue";

import imagePlaceholder from "@/assets/dot.png";

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

function showImage(index, currentImage) {
  console.log("ss", imagePlaceholder, currentImage);
  if (currentImage == imagePlaceholder) {
    console.log("got");
    return;
  }

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
    <v-img
      :src="currentFullSizeImage"
      :lazy-src="imagePlaceholder"
      loading="lazy"
      height="95vh"
      max-height="95vh"
      max-width="95vw"
    >
      <template v-slot:placeholder>
        <div class="d-flex align-center justify-center fill-height">
          <v-icon
            color="warning"
            icon="mdi-cloud-alert"
            size="x-large"
             class="mr-5"
          ></v-icon>
          <div>
            Get online to view this picture
          </div>
        </div>
      </template>
    </v-img>
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
      :lazy-src="imagePlaceholder"
      class="ma-1"
      cover
      style="display: inline-block; width: 6em; height: 6em"
      @click="showImage(index, this.src)"
    >
      <template v-slot:placeholder>
        <div class="d-flex align-center justify-center fill-height">
          <v-icon
            color="warning"
            icon="mdi-cloud-alert"
            size="x-large"
          ></v-icon>
        </div>
      </template>
    </v-img>
  </template>
</template>
