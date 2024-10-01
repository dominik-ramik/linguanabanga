<script setup>
import { ref, computed, onUnmounted } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { useGlobalMessageChannel } from "@/composables/useGlobalMessageChannel";

const dictionaryStore = useDictionaryStore();
const tab = ref(null);

const currentlyCachedAssets = ref(null);

const uncachedAssets = computed(() => {
  return dictionaryStore.dictionary.preloadableAssets.filter((asset) => {
    return currentlyCachedAssets.value == null
      ? true
      : !currentlyCachedAssets.value.includes(
          encodeURI(window.location.origin + asset.path)
        );
  });
});

const assetsSize = computed(() => {
  let uncachedSize = 0;
  let totalSize = 0;

  for (const asset of dictionaryStore.dictionary.preloadableAssets) {
    totalSize += asset.size;

    const uncachedFound = uncachedAssets.value.find(
      (uncached) => uncached.path == asset.path
    );
    if (uncachedFound !== undefined) {
      uncachedSize += uncachedFound.size;
    }
  }

  let totalSizeMb = (totalSize / 1024.0 / 1024.0).toFixed(1);
  let uncachedSizeMb = (uncachedSize / 1024.0 / 1024.0).toFixed(1);

  return { uncachedAssets: uncachedSizeMb, allAssets: totalSizeMb };
});

const downloadingMissingAssets = ref(false);
const breakDownload = ref(false);

async function downloadMissingAssets() {
  breakDownload.value = false;
  if (currentlyCachedAssets.value == null) {
    return;
  }

  const intervalGetCachedAssets = window.setInterval(() => {
    getCachedAssets();
  }, 5000);

  async function downloadInBatches(urls, parallelRequests = 4) {
    for (let i = 0; i < urls.length; i += parallelRequests) {
      if (breakDownload.value == true) {
        breakDownload.value = false;
        downloadingMissingAssets.value = false;
        break;
      }

      const batch = urls.slice(i, i + parallelRequests);

      await Promise.allSettled(
        await batch.map(async function (url) {
          if (breakDownload.value == true) {
            breakDownload.value = false;
            downloadingMissingAssets.value = false;
            return;
          }
          downloadingMissingAssets.value = true;
          await fetch(url).then((response) => {
            if (response.ok) {
              response.blob().then(() => {});
            } else {
              console.error(
                `Failed to fetch ${url}: ${response.statusText}`,
                response
              );
            }
          });
        })
      );
    }
  }

  const parallelRequests = 5;

  try {
    await fetch("/data/data.json");

    downloadInBatches(
      uncachedAssets.value.map((asset) => window.location.origin + asset.path),
      parallelRequests
    );
  } finally {
    downloadingMissingAssets.value = false;
    clearInterval(intervalGetCachedAssets.clear);
    getCachedAssets();
  }
}

function getCachedAssets() {
  try {
    navigator.serviceWorker.controller.postMessage({
      type: "GET_CACHED_ASSETS",
    });
  } catch (ex) {
    console.log(ex);
  }
}
function clearCache() {
  navigator.serviceWorker.controller.postMessage({
    type: "CLEAR_DATA_ASSETS",
  });
  getCachedAssets();
}

getCachedAssets();

//Listen to messages
useGlobalMessageChannel().port1.onmessage = function (message) {
  // Process message
  switch (message.data.type) {
    case "CACHED_ASSETS":
      currentlyCachedAssets.value = message.data.assets;
      break;
    default:
      console.log(message.data);
      break;
  }
};

onUnmounted(() => {
  downloadingMissingAssets.value = false;
  breakDownload.value = true;
});

const progress = computed(() => {
  return 100 * (
    (dictionaryStore.dictionary.preloadableAssets.length -
      uncachedAssets.value.length) /
    dictionaryStore.dictionary.preloadableAssets.length
  );
});
</script>

<template>
  <v-tabs v-model="tab" align-tabs="center">
    <v-tab value="projects">Language and projects</v-tab>
    <v-tab value="offline">Offfline use</v-tab>
    <v-tab value="theme">Theme</v-tab>
    <v-tab value="data">Data</v-tab>
  </v-tabs>

  <v-card class="pa-3">
    <v-tabs-window v-model="tab">
      <v-tabs-window-item value="projects">
        <projects-selector></projects-selector>
      </v-tabs-window-item>
      <v-tabs-window-item value="theme">
        <div class="d-flex align-center flex-column ma-5">
          <toggle-color-theme></toggle-color-theme>
          <div class="text-captionx ma-4">
            Hint: use the dark mode when in the nakamal
          </div>
        </div>
      </v-tabs-window-item>
      <v-tabs-window-item value="offline" class="text-center">
        <div v-if="currentlyCachedAssets == null">
          Checking cached assets ...
        </div>
        <div v-else-if="uncachedAssets.length > 0">
          <div v-if="downloadingMissingAssets">
            <v-progress-linear
              color="primary"
              X-indeterminate
              :model-value="progress"
              :height="12"
              class="mt-3"
            ></v-progress-linear>
            <div class="mt-3">
              <v-progress-circular
                color="primary"
                indeterminate
                :size="25"
              ></v-progress-circular>
              {{
                dictionaryStore.dictionary.preloadableAssets.length -
                uncachedAssets.length
              }}
              / {{ dictionaryStore.dictionary.preloadableAssets.length }} done
              ({{
                (assetsSize.allAssets - assetsSize.uncachedAssets).toFixed(1)
              }}
              Mb / {{ assetsSize.allAssets }} Mb)
            </div>
            <v-btn @click="breakDownload = true" color="primary" class="mt-3">{{
              breakDownload ? "Stopping download" : "Stop download"
            }}</v-btn>
          </div>
          <div
            v-else-if="currentlyCachedAssets !== null"
            class="d-flex flex-column"
          >
            <div>
              To enable full offline use, you need to download
              {{ uncachedAssets.length }} assets (
              {{ assetsSize.uncachedAssets }} Mb) to your device (stay on this
              screen while downloading).
            </div>
            <div>
              <v-btn @click="downloadMissingAssets" color="primary" class="mt-3"
                >Download assets</v-btn
              >
            </div>
            <div>
              <div class="mt-16">
                You can delete the cached assets if you need to reclaim memory
                on your phone.
              </div>
              <div>
                <v-btn @click="clearCache" color="primary">Clear memory</v-btn>
              </div>
            </div>
          </div>
        </div>
        <div v-else>All is ready for you to take this off the grid.</div>
      </v-tabs-window-item>
      <v-tabs-window-item value="data">
        <spreadsheet-importer></spreadsheet-importer>
      </v-tabs-window-item>
    </v-tabs-window>
  </v-card>
</template>
