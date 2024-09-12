<script setup>
import { ref, computed } from "vue";
import { deepCheckHasDisplayableData } from "@/utils/deepCheckHasDisplayableData.js";

const props = defineProps([
  "data",
  "passThroughData",
  "cornerText",
  "layout",
  "icon",
]);

const showDetails = ref(false);

function hasDisplayableSection(section = null) {
  let sectionsToCheck = section ? [section] : ["head", "body", "details"];

  return sectionsToCheck
    .map((currentSection) => {
      if (props.layout.tree[currentSection] === undefined) {
        return false;
      } else {
        return props.layout.tree[currentSection]
          .map((layout) => {
            return deepCheckHasDisplayableData(props.data[layout.name], layout);
          })
          .includes(true);
      }
    })
    .includes(true);
}

const matchesPerPlacement = computed(() => {
  const supportedPlacements = [];

  if (props.layout.flat["hidden"]?.length > 0) {
    supportedPlacements.push("hidden");
  }
  if (
    props.layout.flat["details"]?.length > 0 &&
    hasDisplayableSection("details")
  ) {
    supportedPlacements.push("details");
  }

  const placementMatches = {};

  for (const placement of supportedPlacements) {
    const matchesInThisPlacement = props.layout.flat[placement]
      ?.filter((l) => {
        if (l.columnName.replaceAll("#", "") === "indexlevel") {
          return false;
        }

        return props.passThroughData?.matches
          ?.map((m) => m.key)
          .includes(l.columnName.replaceAll("#", ""));
      })
      .map((l) => l.title);

    if (matchesInThisPlacement?.length > 0) {
      placementMatches[placement] = matchesInThisPlacement;
    }
  }

  return placementMatches;
});
</script>

<template>
  <v-card
    scrollable
    density="compact"
    class="ma-1 mb-2 pa-2"
    v-if="hasDisplayableSection()"
  >
    <v-card-header
      class="d-flex flex-wrap align-center"
      v-if="hasDisplayableSection('head')"
    >
      <v-icon v-if="props.icon" :icon="props.icon" class="mr-1"></v-icon>
      <DynamicDataContainer
        v-for="(layout, index) in props.layout.tree['head']"
        v-bind:key="index"
        :passThroughData="props.passThroughData"
        :currentData="props.data"
        :layout="layout"
        :lastIdProp="props.data.id"
        :lastTableTypeProp="props.data.__meta.table.tableType"
      />
    </v-card-header>
    <v-card-text
      v-if="
        hasDisplayableSection('body') ||
        hasDisplayableSection('details') ||
        matchesPerPlacement['details'] ||
        matchesPerPlacement['hidden'] ||
        props.cornerText
      "
    >
      <v-sheet
        v-if="props.cornerText"
        class="font-italic font-weight-light"
        style="
          background-color: transparent;
          color: rgb(var(--v-theme-primary));
          font-size: 85%;
          margin-left: 2px;
          position: absolute;
          top: -2px;
          right: 2px;
        "
        @click="show = !show"
      >
        {{ props.cornerText }}
        <!--
        <div
          style="
            height: 0.8em;
            width: 0.8em;
            background-color: #f44336;
            border-radius: 50%;
            display: inline-block;
          "
        ></div>
        -->
      </v-sheet>
      <DynamicDataContainer
        v-for="(layout, index) in props.layout.tree['body']"
        v-bind:key="index"
        :passThroughData="props.passThroughData"
        :currentData="props.data"
        :layout="layout"
        :lastIdProp="props.data.id"
        :lastTableTypeProp="props.data.__meta.table.tableType"
      />
      <v-chip
        v-for="(match, index) in matchesPerPlacement['hidden']"
        v-bind:key="index"
        class="mr-1"
        color="warning"
        size="small"
        variant="outlined"
      >
        <v-icon icon="mdi-magnify" start></v-icon>
        Matches in {{ match }}
      </v-chip>

      <div
        class="d-flex justify-end ma-0"
        style="margin-top: 0; position: absolute; left: 0; right: 0; bottom: 0"
      >
        <v-chip
          v-if="matchesPerPlacement['details'] && !showDetails"
          class="ma-0 mr-1"
          color="warning"
          variant="outlined"
          size="small"
          style="position: relative; top: 3px"
          @click="showDetails = !showDetails"
        >
          Show matches in details
        </v-chip>
        <v-sheet
          v-if="hasDisplayableSection('details')"
          class="triangle"
          :style="`background-image: linear-gradient(to bottom right, transparent 50%, ${
            matchesPerPlacement['details']
              ? 'rgb(var(--v-theme-warning))'
              : 'rgb(var(--v-theme-primary))'
          } 0);`"
          @click="showDetails = !showDetails"
        >
          <v-icon
            color="surface"
            size="x-small"
            class="cursor-pointer"
            style="position: absolute; right: 3px; bottom: 3px"
            >{{
              showDetails ? "mdi-chevron-up" : "mdi-information-outline"
            }}</v-icon
          >
        </v-sheet>
      </div>
    </v-card-text>

    <v-expand-transition>
      <div v-if="showDetails && hasDisplayableSection('details')">
        <v-divider></v-divider>
        <v-card-text>
          <DynamicDataContainer
            v-for="(layout, index) in props.layout.tree['details']"
            v-bind:key="index"
            :passThroughData="props.passThroughData"
            :currentData="props.data"
            :layout="layout"
            :lastIdProp="props.data.id"
            :lastTableTypeProp="props.data.__meta.table.tableType"
          />
        </v-card-text>
      </div>
    </v-expand-transition>
  </v-card>
</template>

<style scoped>
.triangle {
  width: 32px;
  height: 32px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: left, right;
}
</style>
