<script setup>
import { useDictionaryStore } from "@/store/DictionaryStore";

const dictionaryStore = useDictionaryStore();
</script>

<template>
  <div v-if="dictionaryStore.filter.selectedProjects.length > 0" class="d-flex flex-column align-center">
    <div>
      <div v-if="dictionaryStore.cache.currentlyCachedAssets == null">
        <div class="d-flex">
          <v-progress-circular
            color="primary"
            indeterminate
            class="mr-2"
            :size="25"
          ></v-progress-circular>
          <div>Checking cached assets ...</div>
        </div>
      </div>
      <div v-else-if="dictionaryStore.cache.queue.length > 0">
        <div v-if="dictionaryStore.cache.processQueue">
          <div class="text-center">
            <v-progress-circular
              :model-value="dictionaryStore.cache.downloadProgress"
              :rotate="360"
              :size="300"
              :width="25"
              color="primary"
              class="ma-4"
            >
              <template v-slot:default>
                <div class="d-flex flex-column">
                  <div>
                    <v-icon
                      color="primary"
                      icon="mdi-cloud-download"
                      size="x-large"
                    ></v-icon>
                  </div>
                  {{ dictionaryStore.cache.downloadProgress.toFixed(1) }}%
                  <v-btn
                    @click="dictionaryStore.stopDownloadingEnqueuedAssets()"
                    color="primary"
                    class="mt-3"
                    :disabled="
                      dictionaryStore.cache.queueBeingProcessed &&
                      !dictionaryStore.processQueue
                    "
                    >{{
                      dictionaryStore.cache.queueBeingProcessed &&
                      !dictionaryStore.processQueue
                        ? "Stopping download"
                        : "Stop download"
                    }}
                  </v-btn>
                </div>
              </template>
            </v-progress-circular>
          </div>
        </div>
        <div
          v-else-if="dictionaryStore.cache.currentlyCachedAssets !== null"
          class="d-flex flex-column align-center"
        >
          <div>
            To enable full offline use, you need to download
            <b>{{ dictionaryStore.cache.requiredDownloadSize.toFixed(1) }} MB</b> of
            assets to your device (you can continue using the dictionary while
            downloading).
          </div>
          <div>
            <v-btn
              @click="dictionaryStore.downloadEnqueuedAssets()"
              color="primary"
              class="mt-3 mb-3"
              >Prepare offline use for
              {{ dictionaryStore.filter.selectedProjects.length }}
              dictionaries</v-btn
            >
          </div>
        </div>
      </div>
      <div v-else>All is ready for you to take this off the grid.</div>
    </div>
  </div>
</template>
