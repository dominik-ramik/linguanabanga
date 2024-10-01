<script setup>
import { micromark } from "micromark";
import { version } from '@/../package.json'
</script>

<template>
  <h1>{{ $t("mainMenu.aboutAppTitle") }}</h1>
  <div v-html="micromark($t('mainMenu.aboutAppText'))"></div>
  <div>v{{ version }}</div>
  
</template>
