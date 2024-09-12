<script setup>
import { ref } from 'vue'
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import { micromark } from "micromark";
const dictionaryStore = useDictionaryStore();

</script>

<template>
    <h1>About this dictionary</h1>
    <div class="markdown" v-html="micromark(dictionaryStore.dictionary.portalAbout)">
    </div>
</template>
