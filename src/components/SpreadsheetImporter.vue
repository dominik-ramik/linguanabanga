<script setup>
import { ref, computed } from "vue";
import { DictionaryDataImport } from "@/utils/DictionaryDataImport.js";
import { useDictionaryStore } from "../store/DictionaryStore";

const dataIsReady = ref(false);
const dictionaryStore = useDictionaryStore();

let dictionaryDataImport = new DictionaryDataImport();

const dropProcessing = ref(false);
const isDraggingOver = ref(false);
const snackbar = ref(false);
const logMessages = ref([]);
const progressLabel = ref("");
const compilationFailed = ref(false);

// Wire up progress callback
dictionaryDataImport.onProgress = ({ label }) => {
  progressLabel.value = label;
};

// Wire up error callback — called when compilation fails
dictionaryDataImport.onError = () => {
  compilationFailed.value = true;
  logMessages.value = [...dictionaryDataImport.loggedMessages].sort(
    (a, b) =>
      (logLevelMeta[a.level]?.order ?? 99) -
      (logLevelMeta[b.level]?.order ?? 99)
  );
  dropProcessing.value = false;
};

const logLevelMeta = {
  critical: { icon: "mdi-alert-octagon", color: "error", order: 0 },
  error: { icon: "mdi-alert-circle", color: "error", order: 1 },
  warning: { icon: "mdi-alert", color: "warning", order: 2 },
  info: { icon: "mdi-information", color: "info", order: 3 },
};

const hasErrors = computed(() =>
  logMessages.value.some((m) => m.level === "critical" || m.level === "error")
);

const errorCount = computed(
  () =>
    logMessages.value.filter(
      (m) => m.level === "critical" || m.level === "error"
    ).length
);

const warningCount = computed(
  () => logMessages.value.filter((m) => m.level === "warning").length
);

function getLevelMeta(level) {
  return logLevelMeta[level] || logLevelMeta.info;
}

/**
 * Group log messages by their "category" — the text before the first colon,
 * or the full message if there is no colon. Groups are sorted by the worst
 * severity in each group, then alphabetically by category name.
 */
const groupedLogMessages = computed(() => {
  const groups = {};

  for (const msg of logMessages.value) {
    const colonIdx = msg.message.indexOf(":");
    // Category = prefix before first ':', trimmed. Full message if no colon.
    const category = colonIdx > 0 ? msg.message.substring(0, colonIdx).trim() : msg.message.trim();
    // Detail = the part after the colon (if any)
    const detail = colonIdx > 0 ? msg.message.substring(colonIdx + 1).trim() : "";

    if (!groups[category]) {
      groups[category] = { category, level: msg.level, items: [] };
    }
    groups[category].items.push({ ...msg, detail });

    // Promote group level to the worst severity found in its items
    const currentOrder = logLevelMeta[groups[category].level]?.order ?? 99;
    const newOrder = logLevelMeta[msg.level]?.order ?? 99;
    if (newOrder < currentOrder) {
      groups[category].level = msg.level;
    }
  }

  return Object.values(groups).sort((a, b) => {
    const levelDiff =
      (logLevelMeta[a.level]?.order ?? 99) -
      (logLevelMeta[b.level]?.order ?? 99);
    if (levelDiff !== 0) return levelDiff;
    return a.category.localeCompare(b.category);
  });
});

async function dropHandler(e) {
  dropProcessing.value = true;
  dataIsReady.value = false;
  compilationFailed.value = false;
  logMessages.value = [];
  progressLabel.value = "Starting...";
  await dictionaryDataImport.dataFolderDropHandler(e, dataReady);
}

let dataToDownload = {};

function dataReady(dictonaryData) {
  dataToDownload = JSON.stringify(dictonaryData);
  dictionaryStore.reloadDictionaryData(dictonaryData);
  dataIsReady.value = true;
  snackbar.value = true;

  // Copy log messages from the import instance, sorted by severity
  logMessages.value = [...dictionaryDataImport.loggedMessages].sort(
    (a, b) =>
      (logLevelMeta[a.level]?.order ?? 99) -
      (logLevelMeta[b.level]?.order ?? 99)
  );

  dropProcessing.value = false;
}

function downloadCompiledData() {
  var blob = new Blob([dataToDownload], {
    type: "text/plain;charset=utf-8",
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "data.json";
  link.click();
  URL.revokeObjectURL(link.href);
}
</script>

<template>
  <div v-if="dropProcessing" class="d-flex flex-column align-center mt-8" style="max-width: 50vw; margin: 0 auto">
    <span class="text-body-2 mb-2">{{ progressLabel }}</span>
    <v-progress-linear
      indeterminate
      color="primary"
      height="6"
      rounded
      style="width: 100%"
    />
  </div>
  <div class="d-flex align-center flex-column">
    <div
      v-if="!dropProcessing"
      style="
        width: 100%;
        max-width: 50vw;
        height: 20vh;
        border: 1px solid rgb(var(--v-theme-primary));
        background-color: rgba(var(--v-theme-primary), 0.2);
      "
      :style="
        isDraggingOver
          ? 'background-color: rgba(var(--v-theme-primary), 0.1)'
          : ''
      "
      class="d-flex flex-column justify-center align-center mb-2"
      @drop.prevent="dropHandler"
      @dragenter.prevent="isDraggingOver = true"
      @dragover.prevent
      @dragleave="isDraggingOver = false"
    >
      <v-icon icon="mdi-download" color="primary" size="x-large"></v-icon>
      <span class="text-primary">Drop data folder</span>
    </div>

    <v-btn
      color="primary"
      v-if="dataIsReady"
      @click="downloadCompiledData"
      class="mb-2"
    >
      Download data JSON
    </v-btn>
  </div>

  <!-- Compilation failed banner -->
  <v-alert
    v-if="compilationFailed"
    type="error"
    variant="tonal"
    class="mt-4"
    style="max-width: 50vw; margin: 0 auto"
    icon="mdi-alert-octagon"
  >
    Compilation did not succeed. See the log below for details.
  </v-alert>

  <!-- Compilation Log -->
  <div
    v-if="logMessages.length > 0"
    class="mt-4"
    style="max-width: 50vw; margin: 0 auto"
  >
    <div class="d-flex align-center mb-2">
      <v-icon
        :icon="hasErrors ? 'mdi-alert-circle' : 'mdi-check-circle'"
        :color="hasErrors ? 'error' : 'success'"
        class="mr-2"
      />
      <span class="text-body-1 font-weight-medium">
        Compilation Log
      </span>
      <v-chip
        v-if="errorCount > 0"
        color="error"
        size="small"
        class="ml-2"
        variant="tonal"
      >
        {{ errorCount }} error{{ errorCount > 1 ? "s" : "" }}
      </v-chip>
      <v-chip
        v-if="warningCount > 0"
        color="warning"
        size="small"
        class="ml-2"
        variant="tonal"
      >
        {{ warningCount }} warning{{ warningCount > 1 ? "s" : "" }}
      </v-chip>
    </div>

    <div
      class="rounded border"
      style="max-height: 50vh; overflow-y: auto"
    >
      <template v-for="(group, gi) in groupedLogMessages" :key="gi">
        <!-- Single-item groups: render as a simple row, no expansion needed -->
        <div
          v-if="group.items.length === 1"
          class="d-flex align-center px-4 py-2"
          style="min-height: 36px"
        >
          <v-icon
            :icon="getLevelMeta(group.items[0].level).icon"
            :color="getLevelMeta(group.items[0].level).color"
            size="small"
            class="mr-3"
          />
          <span
            class="text-body-2 flex-grow-1"
            style="overflow-wrap: break-word; word-break: break-word"
          >
            {{ group.items[0].message }}
          </span>
          <v-chip
            :color="getLevelMeta(group.items[0].level).color"
            size="x-small"
            variant="tonal"
            label
            class="ml-2 flex-shrink-0"
          >
            {{ group.items[0].level }}
          </v-chip>
        </div>

        <!-- Multi-item groups: expandable -->
        <v-expansion-panels v-else variant="accordion" flat>
          <v-expansion-panel>
            <v-expansion-panel-title class="py-1 px-4" style="min-height: 40px">
              <div class="d-flex align-center flex-grow-1 mr-2">
                <v-icon
                  :icon="getLevelMeta(group.level).icon"
                  :color="getLevelMeta(group.level).color"
                  size="small"
                  class="mr-3"
                />
                <span class="text-body-2 font-weight-medium">
                  {{ group.category }}
                </span>
                <v-chip
                  :color="getLevelMeta(group.level).color"
                  size="x-small"
                  variant="tonal"
                  label
                  class="ml-2"
                >
                  {{ group.items.length }}
                </v-chip>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-list density="compact" class="py-0">
                <v-list-item
                  v-for="(msg, mi) in group.items"
                  :key="mi"
                  class="py-0 px-2"
                  style="min-height: 28px"
                >
                  <template #prepend>
                    <v-icon
                      :icon="getLevelMeta(msg.level).icon"
                      :color="getLevelMeta(msg.level).color"
                      size="x-small"
                      class="mr-2"
                    />
                  </template>
                  <v-list-item-title
                    class="text-body-2"
                    style="white-space: normal; overflow-wrap: break-word"
                  >
                    {{ msg.detail || msg.message }}
                  </v-list-item-title>
                </v-list-item>
              </v-list>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <v-divider v-if="gi < groupedLogMessages.length - 1" />
      </template>
    </div>
  </div>

  <v-snackbar v-model="snackbar"> Data ready </v-snackbar>

  <!--
  <v-alert text="..." type="warning"></v-alert>
  <v-stepper :items="['Step 1', 'Step 2', 'Step 3']">
    <template v-slot:item.1>
      <v-card title="Step One" flat>...</v-card>
    </template>

    <template v-slot:item.2>
      <v-card title="Step Two" flat>...</v-card>
    </template>

    <template v-slot:item.3>
      <v-card title="Step Three" flat>...</v-card>
    </template>
  </v-stepper>
  -->
</template>
