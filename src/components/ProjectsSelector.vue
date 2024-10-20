<script setup>
import { ref, computed } from "vue";

import { useRouter, useRoute } from "vue-router";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { i18n } from "@/i18n";

const router = useRouter();
const route = useRoute();

const dictionaryStore = useDictionaryStore();

function changeLocale(locale) {
  router.push({ name: route.name, params: { locale: locale } });
}

const pathSortedProjects = computed(() => {
  let entries = Object.entries(
    dictionaryStore.dictionary.allVersionsProjectsMeta[i18n.global.locale.value]
      .projects
  ).map((entry) => entry[1]);

  let currentLanguageProjects = entries.filter((entry) =>
    entry.translations?.includes(i18n.global.locale.value)
  );

  return currentLanguageProjects.sort((a, b) => {
    return a.menuPath.localeCompare(b.menuPath);
  });
});

const offlineSnack = ref(false);
</script>

<template>
  <div>
    <div>
      <div v-if="dictionaryStore.filter.selectedProjects.length == 0">
        You need to select one or more dictionaries from the list below
      </div>
      <div v-else>
        <div>
          You have selected
          {{ dictionaryStore.filter.selectedProjects.length }} dictionaries
        </div>
        <div>
          <div v-if="dictionaryStore.cache.currentlyCachedAssets == null">
            <v-progress-circular
              color="primary"
              indeterminate
              :size="25"
            ></v-progress-circular>
            <div>Checking cached assets ...</div>
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

                        QL: {{ dictionaryStore.cache.queue.length }}
                      </v-btn>
                    </div>
                  </template>
                </v-progress-circular>
              </div>
            </div>
            <div
              v-else-if="dictionaryStore.cache.currentlyCachedAssets !== null"
              class="d-flex flex-column"
            >
              <div>
                To enable full offline use, you need to download
                {{ dictionaryStore.cache.requiredDownloadSize.toFixed(1) }} Mb
                of assets to your device (you can continue using the dictionary
                while downloading).
              </div>
              <div>
                <v-btn
                  @click="dictionaryStore.downloadEnqueuedAssets()"
                  color="primary"
                  class="mt-3"
                  >Download assets</v-btn
                >
              </div>
            </div>
          </div>
          <div v-else>All is ready for you to take this off the grid.</div>
        </div>
      </div>
    </div>
  </div>

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
        :value="project.projectTag"
        :label="project.languageName + ': ' + project.menuPath"
      ></v-checkbox>
    </v-card>
  </div>

  <div
    v-if="
      Object.keys(dictionaryStore.dictionary.allVersionsProjectsMeta).length > 1
    "
  >
    <div class="text-h5 mb-2">Language</div>
    <div
      v-for="(meta, langKey) in dictionaryStore.dictionary
        .allVersionsProjectsMeta"
      v-bind:key="langKey"
    >
      <v-btn
        color="primary"
        class="ma-2"
        @click="changeLocale(langKey)"
        :disabled="langKey == i18n.global.locale.value"
      >
        <div v-if="langKey != i18n.global.locale.value">
          Switch to {{ meta.languageInfo.name }}
        </div>
        <div v-else>Your language is {{ meta.languageInfo.name }}</div>
      </v-btn>
    </div>
  </div>

  <div v-if="dictionaryStore.cache.currentlyCachedAssets?.length > 0">
    <div class="mt-16">
      You can delete the cached assets if you need to reclaim memory on your
      phone. You won't have access to recordings or images while offline.
    </div>
    <div>
      <v-btn @click="dictionaryStore.clearAssetsCache()" color="primary"
        >Clear memory</v-btn
      >
    </div>
  </div>

  <v-snackbar v-model="offlineSnack"
    >You need to get online to download the dictionary content</v-snackbar
  >
</template>
