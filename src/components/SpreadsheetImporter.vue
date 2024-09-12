<script setup>
import { ref } from "vue";
import { DictionaryDataImport } from "@/utils/DictionaryDataImport.js";
import { useDictionaryStore } from "../store/DictionaryStore";

const dataIsReady = ref(false);
const dictionaryStore = useDictionaryStore();

let dictionaryDataImport = new DictionaryDataImport();

const dropProcessing = ref(false);
const isDraggingOver = ref(false);
const snackbar = ref(false);

async function dropHandler(e) {
  dropProcessing.value = true;
  await dictionaryDataImport.dataFolderDropHandler(e, dataReady);
}

let dataToDownload = {};

function dataReady(dictonaryData) {
  dataToDownload = JSON.stringify(dictonaryData);
  dictionaryStore.reloadDictionaryData(dictonaryData);
  dataIsReady.value = true;
  snackbar.value = true;

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
  <div v-if="dropProcessing">Processing ...</div>
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
