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

  await fetch("/data/data.json");

  async function downloadInBatches(urls, parallelRequests = 4) {
    for (let i = 0; i < urls.length; i += parallelRequests) {
      if (breakDownload.value == true) {
        breakDownload.value = false;
        downloadingMissingAssets.value = false;
        break;
      }

      const batch = urls.slice(i, i + parallelRequests);

      await Promise.allSettled(
        batch.map((url) =>
          fetch(url).then((response) => {
            if (response.ok) {
              response.blob().then(() => {
                currentlyCachedAssets.value.push(encodeURI(url));
                downloadingMissingAssets.value = true;
              });
            } else {
              console.error(
                `Failed to fetch ${url}: ${response.statusText}`,
                response
              );
            }
          })
        )
      );
    }
  }

  const parallelRequests = 2;

  try {
    downloadInBatches(
      uncachedAssets.value.map((asset) => window.location.origin + asset.path),
      parallelRequests
    );
  } finally {
    getCachedAssets();
    downloadingMissingAssets.value = false;
  }
}

function getCachedAssets() {
  navigator.serviceWorker.controller.postMessage({
    type: "GET_CACHED_ASSETS",
  });
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
        <div v-if="currentlyCachedAssets == null">Checking cached assets ...</div>
        <div v-else-if="uncachedAssets.length > 0">
          <div v-if="downloadingMissingAssets">
            <v-progress-linear
              color="primary"
              :model-value="assetsSize.uncachedAssets / assetsSize.allAssets"
              :height="12"
              class="mt-3"
            ></v-progress-linear>
            <div class="mt-3">
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
            <v-btn @click="breakDownload = true" color="primary" class="mt-3"
              >Stop download</v-btn
            >
          </div>
          <div v-else-if="currentlyCachedAssets !== null">
            <div>
              To enable full offline use, you need to download
              {{ uncachedAssets.length }} assets (
              {{ assetsSize.uncachedAssets }} Mb) to your device.
            </div>
            <v-btn @click="downloadMissingAssets" color="primary" class="mt-3"
              >Download assets</v-btn
            >
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
