<script setup>
import { micromark } from "micromark";
import { version } from '@/../package.json'
</script>

<template>
  <div class="pa-4">
    <h1>{{ $t("mainMenu.aboutAppTitle") }}</h1>
    <div v-html="micromark($t('mainMenu.aboutAppText'))"></div>
    <div>v{{ version }}</div>
  </div>
  
</template>
