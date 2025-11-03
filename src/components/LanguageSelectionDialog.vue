<script setup>
import { ref, computed, watch } from "vue";

import { useRouter, useRoute } from "vue-router";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { i18n } from "@/i18n";

const router = useRouter();
const route = useRoute();

const dictionaryStore = useDictionaryStore();

function changeLocale(locale) {
  setTimeout(() => {
    isActive.value = true;
  }, 500);
  router.push({ name: route.name, params: { locale: locale } });
}

const isActive = ref(false);
</script>

<template>
  <v-dialog max-width="300">
    <template v-slot:activator="{ props: activatorProps }">
      <div>
        <v-btn
          prepend-icon="mdi-web"
          v-bind="activatorProps"
          class="ma-3 mt-5"
          color="primary"
          >Select display language</v-btn
        >
      </div>
    </template>

    <template v-slot:default="{ isActive }">
      <v-card title="Language">
        <v-card-text style="min-height: 200px">
          <div
            v-for="(meta, langKey) in dictionaryStore.dictionary
              .allVersionsProjectsMeta"
            v-bind:key="langKey"
          >
            <v-btn
              color="primary"
              class="ma-2"
              block
              @click="changeLocale(langKey)"
              :disabled="langKey == i18n.global.locale.value"
            >
              <div>
                {{ meta.languageInfo.name }}
              </div>
            </v-btn>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text="Close" @click="isActive.value = false"></v-btn>
        </v-card-actions>
      </v-card>
    </template>
  </v-dialog>
</template>
