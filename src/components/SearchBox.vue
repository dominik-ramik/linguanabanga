<script setup>
import { ref, computed, watch } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import { useDisplay } from "vuetify";

const dictionaryStore = useDictionaryStore();

const { mobile } = useDisplay();
const props = defineProps([
  "filterObject",
  "specialCharacters",
  "filtersPanelReference",
  "actionPanelModel",
]);

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
      cursorPosition + 1
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
  { deep: true }
);

watch(
  () => dictionaryStore.filter.text,
  (newValue) => {
    debounceText.value = newValue;
  }
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
  >
    <template v-slot:append-inner>
      <v-menu v-if="props.specialCharacters">
        <template v-slot:activator="{ props }">
          <v-btn icon v-bind="props" :density="mobile ? 'compact' : 'default'">
            <v-icon color="primary">mdi-keyboard</v-icon>
          </v-btn>
        </template>
        <v-card variant="elevated" style="max-width: 470px">
          <template v-slot:text>
            <div class="d-flex flex-wrap justify-center">
              <v-btn
                v-for="char in props.specialCharacters"
                v-bind:key="char"
                class="ma-1"
                variant="tonal"
                color="primary"
                @click="appendSpecialCharacter(char)"
                >{{ char }}</v-btn
              >
            </div>
          </template>
        </v-card>
      </v-menu>
    </template>
  </v-text-field>
</template>
