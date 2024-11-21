<script setup>
import { useDictionaryStore } from "@/store/DictionaryStore";
import { computed } from "vue";

const dictionaryStore = useDictionaryStore();

const cachedItemsSize = computed(() => {
  let size = 0;

  dictionaryStore.cache.currentlyCachedAssets?.value?.forEach((asset) => size += asset.size)

  return size / 1024 / 1024;
});
</script>

<template>
  <v-dialog max-width="500">
    <template v-slot:activator="{ props: activatorProps }">
      <div
        v-if="dictionaryStore.cache.currentlyCachedAssets?.length > 0 || 1 == 1"
      >
        <div>
          <div class="mt-1 mb-1" style="max-width: 600px">
            You can delete the cached assets if you need to reclaim memory on
            your device. You won't have access to recordings or images while
            offline.
          </div>
          <div>
            <v-btn
              v-bind="activatorProps"
              color="warning"
              prepend-icon="mdi-trash-can-outline"
              >Clear memory {{ cachedItemsSize }} Mb</v-btn
            >
          </div>
        </div>
      </div>
    </template>

    <template v-slot>
      <v-card title="Delete?">
        <v-card-text style="min-height: 340px">
          <div class="text-h5 mb-2">Dictionary selection</div>
          <v-btn
            @click="dictionaryStore.clearAssetsCache()"
            color="warning"
            prepend-icon="mdi-trash-can-outline"
            >Clear memory</v-btn
          >
          <div>
            <v-card
              v-for="project in pathSortedProjects"
              v-bind:key="project"
              class="d-flex align-center flex-row"
            >
              <v-checkbox
                density="compact"
                class="mr-2 flex-grow-1"
                v-model="dictionaryStore.filter.selectedProjects"
                :value="project.projectId"
                :label="project.languageName + ': ' + project.menuPath"
              ></v-checkbox>
            </v-card>
          </div>
        </v-card-text>
      </v-card>
    </template>
  </v-dialog>
</template>
