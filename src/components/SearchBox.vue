<script setup>
import { ref, computed, watch } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import { useDisplay } from "vuetify";

const dictionaryStore = useDictionaryStore();

const { mobile } = useDisplay();
const passedProps = defineProps([
  "filterObject",
  "specialCharacters",
  "filtersPanelReference",
  "actionPanelModel",
]);

// ADDED "input-focus" and "input-typing" to the emits
const emit = defineEmits(["toggle-filters", "input-focus", "input-typing"]);

const fulltextSearch = ref(null);

function appendSpecialCharacter(char) {
  let cursorPosition = fulltextSearch.value.selectionStart;

  let text = dictionaryStore.filter.text;

  if (dictionaryStore.filter.text && dictionaryStore.filter.text.length > 0) {
    dictionaryStore.filter.text =
      text.substring(0, cursorPosition) + char + text.substring(cursorPosition);
  } else {
    dictionaryStore.filter.text = char;
  }

  setTimeout(() => {
    fulltextSearch.value.focus();
    fulltextSearch.value.setSelectionRange(
      cursorPosition + 1,
      cursorPosition + 1,
    );
  }, 200);
}

const debounceText = ref(dictionaryStore.filter.text);

let _debounceRoutingTimer = null;
watch(
  () => debounceText,
  () => {
    //update the filter text with debounce
    clearTimeout(_debounceRoutingTimer);
    _debounceRoutingTimer = setTimeout(() => {
      //debounce
      dictionaryStore.filter.text = debounceText.value;
    }, 500);
  },
  { deep: true },
);

watch(
  () => dictionaryStore.filter.text,
  (newValue) => {
    debounceText.value = newValue;
  },
);
</script>

<template>
  <v-text-field
    ref="fulltextSearch"
    :loading="loading"
    prepend-inner-icon="mdi-magnify"
    :class="mobile ? '' : 'mr-3'"
    :variant="mobile ? 'flat' : 'solo'"
    label="Search"
    v-model="debounceText"
    hide-details
    single-line
    :density="mobile ? 'compact' : 'default'"
    clearable
    style="max-width: 630px"
    clear-icon="mdi-close-circle"
    @focus="emit('input-focus')"
    @input="emit('input-typing')"
    @keydown="emit('input-typing')"
  >
    <template v-slot:append-inner>
      <div class="d-flex align-center">
        <v-menu v-if="passedProps.specialCharacters">
          <template v-slot:activator="{ props }">
            <v-btn
              icon
              variant="text"
              v-bind="props"
              :density="mobile ? 'compact' : 'default'"
            >
              <v-icon color="primary">mdi-keyboard</v-icon>
            </v-btn>
          </template>
          <v-card variant="elevated" style="max-width: 470px">
            <template v-slot:text>
              <div class="d-flex flex-wrap justify-center">
                <v-btn
                  v-for="char in passedProps.specialCharacters"
                  v-bind:key="char"
                  class="ma-1"
                  variant="tonal"
                  color="primary"
                  @click.stop="appendSpecialCharacter(char)"
                  >{{ char }}</v-btn
                >
              </div>
            </template>
          </v-card>
        </v-menu>

        <v-btn
          v-if="mobile"
          icon
          variant="text"
          :density="mobile ? 'compact' : 'default'"
          @click.prevent.stop="emit('toggle-filters', $event)"
          class="ml-4"
        >
          <v-badge
            color="error"
            :content="dictionaryStore.filter.activeFilters.length"
            :model-value="dictionaryStore.filter.activeFilters.length > 0"
          >
            <v-icon color="primary">mdi-binoculars</v-icon>
          </v-badge>
        </v-btn>
      </div>
    </template>
  </v-text-field>
</template>