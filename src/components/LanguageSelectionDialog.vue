<script setup>
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { i18n } from "@/i18n";

const router = useRouter();
const route = useRoute();

const dictionaryStore = useDictionaryStore();

function changeLocale(locale) {
  router.push({ name: route.name, params: { locale: locale } });
}
</script>

<template>
  <div class="language-selection-list pa-4">
    <div class="mb-2 font-weight-medium" style="font-size: 1.2em;">
      {{ i18n.global.t("mainMenu.selectDisplayLanguage") }}
    </div>
    <div>
      <div
        v-for="(meta, langKey) in dictionaryStore.dictionary.allVersionsProjectsMeta"
        :key="langKey"
        class="mb-4"
      >
        <v-row class="align-center" no-gutters>
          <v-col cols="12" sm="auto">
            <v-btn
              color="primary"
              class="ma-2"
              @click="changeLocale(langKey)"
              :disabled="langKey == i18n.global.locale.value"
              prepend-icon="mdi-web"
            >
              {{ meta.languageInfo.name }}
            </v-btn>
          </v-col>
          <v-col cols="12" sm="auto">
            <span class="font-weight-bold ml-4">
              <template v-if="meta.projects && Object.keys(meta.projects).length > 0">
                {{ i18n.global.t("mainMenu.availableDictionaries") }}
              </template>
              <template v-else>
                {{ i18n.global.t("mainMenu.noDictionariesAvailable") }}
              </template>
            </span>
            <div class="ml-2" style="font-size: 0.98em; display: inline;">
              <span v-if="meta.projects && Object.keys(meta.projects).length > 0">
                <span
                  v-for="(proj, idx) in Object.values(meta.projects).sort((a, b) => a.projectName.localeCompare(b.projectName))"
                  :key="proj.projectId"
                >
                  {{ proj.projectName }}<span v-if="idx < Object.keys(meta.projects).length - 1">, </span>
                </span>
              </span>
            </div>
          </v-col>
        </v-row>
      </div>
    </div>
  </div>
</template>
