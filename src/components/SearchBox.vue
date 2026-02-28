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

const emit = defineEmits(["toggle-filters", "input-focus", "input-typing"]);

const fulltextSearch = ref(null);
const stringSearchMode = ref("anywhere");

// ADDED: shortTitle for compact mobile displays
const searchModes = [
  { title: "Search everywhere", value: "anywhere" },
  { title: "Entry starting with", value: "begining" },
  { title: "Anything starting with", value: "right" },
];

const loading = computed(
  () => !!dictionaryStore && !dictionaryStore.dictionary?.isReady,
);

function appendSpecialCharacter(char) {
  let cursorPosition = fulltextSearch.value.selectionStart;
  let text = dictionaryStore.filter.text;

  if (text && text.length > 0) {
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

watch(debounceText, (newValue) => {
  clearTimeout(_debounceRoutingTimer);
  _debounceRoutingTimer = setTimeout(() => {
    dictionaryStore.filter.text = newValue;
  }, 500);
});

watch(
  () => dictionaryStore.filter.text,
  (newValue) => {
    debounceText.value = newValue;
  },
);

const textFiledIsFocused = ref(false);
</script>

<template>
  <div class="d-flex flex-nowrap justify-end w-100 mobile-dropdown">
    <v-select
      v-model="stringSearchMode"
      :items="searchModes"
      item-title="title"
      item-value="value"
      :density="mobile ? 'compact' : 'default'"
      :variant="mobile ? 'plain' : 'text'"
      hide-details
      :class="mobile ? 'ma-0 pa-0' : 'mr-2'"
      :style="
        mobile ? 'max-width: 25vw;' : 'min-width: 200px; max-width: 220px;'
      "
    >
      <template v-slot:selection="{ item }">
        <span
          :style="
            mobile
              ? 'font-size: 0.70rem; max-height: 24px; margin: 0; padding: 0; line-height: 100%'
              : ''
          "
        >
          {{ item.raw.title }}
        </span>
      </template>
    </v-select>

    <v-text-field
      ref="fulltextSearch"
      :loading="loading"
      :variant="mobile ? 'flat' : 'solo'"
      :label="mobile ? $t('searchBox.shortLabel') : $t('searchBox.label')"
      v-model="debounceText"
      hide-details
      single-line
      :density="mobile ? 'compact' : 'default'"
      clearable
      class="flex-grow-1"
      :style="mobile ? '' : 'max-width: 500px;'"
      clear-icon="mdi-close-circle"
      @focus="
        emit('input-focus');
        textFiledIsFocused = true;
      "
      @blur="textFiledIsFocused = false"
      @input="emit('input-typing')"
      @keydown="emit('input-typing')"
    >
      <template v-slot:prepend-inner>
        <v-icon class="mr-1" color="primary">mdi-magnify</v-icon>
      </template>

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
              <v-card-text>
                <div class="d-flex flex-wrap justify-center">
                  <v-btn
                    v-for="char in passedProps.specialCharacters"
                    :key="char"
                    class="ma-1"
                    variant="tonal"
                    color="primary"
                    @click.stop="appendSpecialCharacter(char)"
                  >
                    {{ char }}
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </v-menu>

          <v-btn
            v-if="mobile && dictionaryStore.filter.currentFilters.length > 0"
            icon
            variant="text"
            :density="mobile ? 'compact' : 'default'"
            @click.prevent.stop="emit('toggle-filters', $event)"
            class="ml-2"
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
  </div>
</template>