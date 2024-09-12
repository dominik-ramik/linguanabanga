<script setup>
import { ref } from "vue";

const props = defineProps(["data", "layout", "style"]);

const showDebugPanels = ref(false);
</script>

<template>
  <v-expansion-panels v-if="showDebugPanels">
    <v-expansion-panel title="Layout">
      <v-expansion-panel-text>
        <pre>{{ props.layout }}</pre>
      </v-expansion-panel-text>
    </v-expansion-panel>
    <v-expansion-panel title="Current data">
      <v-expansion-panel-text>
        <pre>
              {{ props.data }}
      </pre
        >
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
  <DynamicDataContainer
    v-for="(layout, index) in props.layout.properties"
    v-bind:key="index"
    :style="props.style"
    :passThroughData="props.data"
    :currentData="
      props.layout.name ? props.data[props.layout.name] : props.data
    "
    :layout="layout"
  />
</template>
