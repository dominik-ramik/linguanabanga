<script setup>
import { ref } from "vue";
import { micromark } from "micromark";
</script>

<template>
  <h1>{{ $t("mainMenu.aboutAppTitle") }}</h1>
  <div v-html="micromark($t('mainMenu.aboutAppText'))"></div>
  
</template>
