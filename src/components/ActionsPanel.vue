<script setup>
import { ref, computed } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { micromark } from "micromark";

const props = defineProps(["type"]);

const dictionaryStore = useDictionaryStore();

const webShareApiSupported = computed(() => {
  return navigator.share;
});

function shareViaWebShare() {
  navigator.share({
    url: window.location,
  });
}

const fuzzinessLevelExplanation = computed(() => {
  switch (dictionaryStore.filter.fuzzinessLevel) {
    case "":
    case "exact":
      return {
        explanation:
          "Text search will show only results containing text that matches exactly the query (case and accents are ignored).",
          tip: "Useful when searching for an exact term or with languages with standardized orthography.",
        query: "color",
        results: [
          { name: "RED **COLOR**", match: true },
          { name: "**Colór** de tierra", match: true },
          { name: "red **colour**", match: false },
          { name: "**culur** is a spelling variant in Middle English", match: false },
          { name: "'hacer **callar**' has nothing to do with color", match: false },
        ],
      };
    case "strict":
      return {
        explanation:
          "Text search will show results containing text similar to the query allowig for some small variation.",
        tip: "Useful when dealing with languages without standardized orthography or looking for slight spelling variations.",
        query: "color",
        results: [
          { name: "RED **COLOR**", match: true },
          { name: "**Colór** de tierra", match: true },
          { name: "red **colour**", match: true },
          { name: "**culur** is a spelling variant in Middle English", match: false },
          { name: "'hacer **callar**' has nothing to do with color", match: false },
        ],
      };
    case "liberal":
      return {
        explanation:
          "Text search will show results containing text similar to the query, but allowig for larger variation than the 'Strict' mode.",
        tip: "Useful when dealing with languages without standardized orthography. May return more irrelevant results but also help to find words in unusual spelling.",
        query: "color",
        results: [
          { name: "RED **COLOR**", match: true },
          { name: "**Colór** de tierra", match: true },
          { name: "red **colour**", match: true },
          { name: "**culur** is a spelling variant in Middle English", match: true },
          { name: "'hacer **callar**' has nothing to do with color", match: true },
        ],
      };
    default:
      break;
  }
  return "dictionaryStore.filter.fuzzinessLevel";
});
</script>

<template>
  <template v-if="props.type == 'search'">
    <DictionaryFilter
      v-for="filterInfo in dictionaryStore.filter.currentFilters"
      v-bind:key="filterInfo.name"
      v-model="dictionaryStore.filter.filters[filterInfo.name]"
      :title="filterInfo.title"
      :items="filterInfo.items"
      :filterInfo="filterInfo"
    ></DictionaryFilter>
    <div v-if="dictionaryStore.filter.activeFilters.length > 0" class="ma-0">
      <v-btn
        @click="dictionaryStore.setFilters()"
        variant="elevated"
        class="mb-3"
        color="primary"
        block
        >Clear all filters</v-btn
      >
    </div>
  </template>

  <template v-if="props.type == 'search'">
    <v-dialog max-width="500">
      <template v-slot:activator="{ props: activatorProps }">
        <v-btn
          prepend-icon="mdi-cog"
          class="mb-3"
          v-bind="activatorProps"
          variant="tonal"
          color="primary"
          block
          >Search settings</v-btn
        >
      </template>

      <template v-slot:default="{ isActive }">
        <v-card title="Search settings">
          <v-card-text style="min-height: 340px">
            <div class="d-flex justify-center">
              <v-btn-toggle
                rounded="0"
                v-model="dictionaryStore.filter.fuzzinessLevel"
                color="primary"
                mandatory
              >
                <v-btn size="small" prepend-icon="mdi-equal" value="exact"
                  >Exact</v-btn
                >
                <v-btn
                  size="small"
                  prepend-icon="mdi-approximately-equal"
                  value="strict"
                  >Strict</v-btn
                >
                <v-btn
                  size="small"
                  prepend-icon="mdi-approximately-equal-box"
                  value="liberal"
                  >Liberal</v-btn
                >
              </v-btn-toggle>
            </div>
            <div class="text-caption mt-3">
              {{ fuzzinessLevelExplanation.explanation }}
            </div>
            <div class="text-caption mt-3">
              Search results for
              <strong>{{ fuzzinessLevelExplanation.query }}</strong
              >:
            </div>
            <div
              class="text-caption ml-2 d-flex"
              v-for="(result, index) in fuzzinessLevelExplanation.results"
              v-bind:key="index"
            >
              <v-icon
                :icon="result.match ? 'mdi-check' : 'mdi-close'"
                class="mr-2"
                :color="result.match ? 'success' : 'error'"
              ></v-icon
              ><span v-html="micromark(result.name)"></span>
            </div>
            <div class="text-caption mt-3">
              <span class="font-weight-bold">Tip:</span>
              {{ fuzzinessLevelExplanation.tip }}
            </div>
          </v-card-text>

          <v-card-actions>
            <v-spacer></v-spacer>

            <v-btn text="Close" @click="isActive.value = false"></v-btn>
          </v-card-actions>
        </v-card>
      </template>
    </v-dialog>

    <v-divider class="mb-3"></v-divider>
  </template>

  <export-and-print-button></export-and-print-button>

  <v-btn
    v-if="webShareApiSupported"
    prepend-icon="mdi-share-variant"
    v-bind="activatorProps"
    variant="tonal"
    class="mb-3"
    color="primary"
    block
    @click="shareViaWebShare()"
    >Share this</v-btn
  >

  <FavoritesButton />
</template>
