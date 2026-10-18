<script setup>
import { useI18n } from "vue-i18n";
import { useServiceWorkerUpdate } from "@/composables/useServiceWorkerUpdate.js";

const { t } = useI18n();
const { showPrompt, isApplying, applyUpdate, dismiss } = useServiceWorkerUpdate();
</script>

<template>
  <!-- v-snackbar respects the app layout (app bar, mobile search footer), so it never covers the search box -->
  <v-snackbar
    :model-value="showPrompt"
    @update:model-value="(open) => { if (!open) dismiss(); }"
    :timeout="-1"
    location="bottom"
    color="primary"
    multi-line
  >
    <div class="d-flex align-center">
      <v-icon icon="mdi-update" class="mr-3"></v-icon>
      <span>{{ t("update.available") }}</span>
    </div>

    <template v-slot:actions>
      <v-btn variant="text" :disabled="isApplying" @click="dismiss">
        {{ t("update.later") }}
      </v-btn>
      <v-btn variant="flat" color="surface" :loading="isApplying" @click="applyUpdate">
        {{ t("update.reload") }}
      </v-btn>
    </template>
  </v-snackbar>
</template>
