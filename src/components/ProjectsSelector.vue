<script setup>
import { ref, computed } from "vue";

import { useRouter, useRoute } from "vue-router";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { useAppSettingsStore } from "@/store/AppSettingsStore.js";
import { i18n, inferLocale, isLocaleSupported, setLocale } from "@/i18n";

const router = useRouter();
const route = useRoute();

const dictionaryStore = useDictionaryStore();

function changeLocale(locale) {
  router.push({ name: route.name, params: { locale: locale } });
}

const panel = ref(
  dictionaryStore.filter.selectedProjects.length == 0
    ? -1
    : Object.keys(dictionaryStore.dictionary.allVersionsProjectsMeta).indexOf(
        i18n.global.locale.value
      )
);

function getProjectsPerLanguage(langCode) {
  return Object.entries(
    dictionaryStore.dictionary.allVersionsProjectsMeta[langCode].projects
  ).filter((entry) => entry[1].translations?.includes(langCode));
}
</script>

<template>
  <div class="">
    <v-expansion-panels v-model="panel">
      <v-expansion-panel
        v-for="(meta, langKey) in dictionaryStore.dictionary
          .allVersionsProjectsMeta"
        v-bind:key="langKey"
      >
        <v-expansion-panel-title @click="console.log('xx')">
          <div class="d-flex align-center" style="width: 100%">
            <div class="flex-grow-1">
              {{ meta.languageInfo.name }} ({{
                getProjectsPerLanguage(langKey).length
              }}
              projects)
            </div>

            <v-btn
              color="primary"
              class="mr-2"
              @click="changeLocale(langKey)"
              :disabled="langKey == i18n.global.locale.value"
            >
            <div v-if="langKey != i18n.global.locale.value">Switch to {{ meta.languageInfo.name }}</div>
            <div v-else>Your language is {{ meta.languageInfo.name }}</div>
              
            </v-btn>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-checkbox
            v-for="project in Object.fromEntries(
              Object.entries(
                dictionaryStore.dictionary.allVersionsProjectsMeta[langKey]
                  .projects
              ).filter((entry) => entry[1].translations?.includes(langKey))
            )"
            v-bind:key="project"
            density="compact"
            v-model="dictionaryStore.filter.selectedProjects"
            :value="project.projectTag"
            :label="project.projectName + ' (' + project.languageName + ')'"
          ></v-checkbox>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>
