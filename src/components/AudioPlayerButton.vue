<script setup>
import { ref } from "vue";

const props = defineProps(["src", "additionalData", "additionalLayout"]);
const player = ref(null);

let audioElement = null;

function playPause() {
  if (audioElement == null) {
    audioElement = new Audio(encodeURI(props.src));
    audioElement.onended = function () {
      audioElement = null;
    };
    audioElement.play();
  } else {
    audioElement = null;
  }
}
</script>

<template>
  <div class="d-flex audio-button">
    <v-btn
      color="primary"
      icon="mdi-volume-high"
      size="x-small"
      class="ml-4"
      @click="playPause()"
    ></v-btn>
    <!--
    <audio
      id="player"
      ref="player"
      v-on:ended="ended"
      v-on:canplay="canPlay"
      :src="encodeURI(props.src)"
    ></audio>
    -->

    <AdditionalDynamicDataContainer
      v-if="props.additionalLayout"
      :data="props.additionalData"
      :layout="props.additionalLayout"
    />
  </div>
</template>
