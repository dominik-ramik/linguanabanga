<script setup>
import { ref } from "vue";
import { DictionaryDataImport } from "@/utils/DictionaryDataImport.js";
import { useDictionaryStore } from "../store/DictionaryStore";
import { useRouter } from "vue-router";

const dataIsReady = ref(false);
const dictionaryStore = useDictionaryStore();

let dictionaryDataImport = new DictionaryDataImport();
const router = useRouter();

const dropProcessing = ref(false);
const isDraggingOver = ref(false);
const snackbar = ref(false);

// [NEW] Reactive variable for error handling
const importError = ref(null);

async function dropHandler(e) {
  dropProcessing.value = true;
  importError.value = null; // [NEW] Reset error before starting
  dataIsReady.value = false;

  try {
    // [NEW] Wrapped in try/catch to handle errors thrown by the importer
    await dictionaryDataImport.dataFolderDropHandler(e, dataReady);
    dropProcessing.value = false;
  } catch (err) {
    console.error(err);
    // [NEW] Set the error message to display in the UI
    importError.value =
      err.message || "An unexpected error occurred during import.";
    dropProcessing.value = false; // Stop processing spinner
  }
}

let dataToDownload = {};

function dataReady(dictonaryData) {
  dataToDownload = JSON.stringify(dictonaryData);
  dictionaryStore.reloadDictionaryData(dictonaryData);
  dataIsReady.value = true;
  snackbar.value = true;

  dropProcessing.value = false;

  const table = dictionaryStore.filter?.table?.value || "dictionary"; // Use current table or fallback
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

// Add a simple template downloader that triggers a browser download of /data/template.xlsx
function downloadTemplate() {
  try {
    const url = "/data/template.xlsx";
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "template.xlsx");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error("Failed to download template:", err);
    importError.value = "Failed to download template.xlsx";
  }
}
</script>

<template>
  <h2 class="mt-2 mb-2" style="text-align: center">Generate data file</h2>

  <div v-if="dropProcessing">Processing ...</div>

  <div>
    <v-alert
      v-for="(msg, index) in dictionaryDataImport.loggedMessages.value"
      :key="index"
      :type="msg.level == 'critical' || msg.level == 'error' ? 'error' : 'info'"
      variant="tonal"
      class="mb-2 mx-auto"
      style="max-width: 80vw; white-space: pre-wrap"
    >
      {{ msg.message }}
    </v-alert>

  </div>

  <v-alert
    v-if="importError"
    type="error"
    title="Import Failed"
    variant="tonal"
    class="mb-4 mx-auto"
    style="max-width: 80vw; white-space: pre-wrap"
    closable
    @click:close="importError = null"
  >
    <!-- render html inside the error string -->
    <span v-html="importError"></span>
  </v-alert>
  
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
      <span class="text-primary">Drop data folder with at least one spreadsheet file called dictionary.xlsx</span>
    </div>

    <p class="mt-2 mb-2" style="text-align: center">
      The data file should be uploaded to your web hosting into the folder
      "data" along with any media files referenced in the spreadsheet
    </p>

    <v-btn
      color="primary"
      v-if="dataIsReady"
      @click="downloadCompiledData"
      class="mb-2"
    >
      Download data file for the server
    </v-btn>

    <!-- New button to download the template.xlsx from /data -->
    <v-btn color="primary" class="mt-10 mb-2" @click="downloadTemplate">
      <v-icon left>mdi-file-excel</v-icon>
      Download minimal template
    </v-btn>
  </div>

  <v-snackbar v-model="snackbar"> Data ready </v-snackbar>
</template>
