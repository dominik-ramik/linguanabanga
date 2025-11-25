<script setup>
import { computed } from 'vue'
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import { micromark } from "micromark";
const dictionaryStore = useDictionaryStore();

// plain computed string (unwrapped) exposed by the store
const portalAboutText = computed(() => dictionaryStore.portalAboutPlain || "");
</script>

<template>
    <h1>About this dictionary</h1>
    <div class="markdown" v-html="micromark(portalAboutText)">
    </div>
</template>
