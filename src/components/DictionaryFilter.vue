<script setup>
import { ref, computed } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import getDataByPath from "@/utils/GetDataByPath";

const dictionaryStore = useDictionaryStore();
const model = defineModel();
const props = defineProps(["title", "items", "filterInfo"]);

const filterInfo = ref(props.filterInfo);

function remove(item) {
  model.value = model.value.filter((find) => find !== item.value);
  updateEnableStates();
}

const quickFilter = ref("");

const enableStates = ref({});

function updateEnableStates() {
  enableStates.value = {};
  for (const result of dictionaryStore.filter.results) {
    let uniqueDataValues = getDataByPath(
      result.item,
      filterInfo.value.name
    ).filter(function (v, i, self) {
      // It returns the index of the first
      // instance of each value
      return i == self.indexOf(v);
    });

    for (const item of uniqueDataValues) {
      if (item) {
        let actualItem = "";
        if (filterInfo.value.type == "ref") {
          actualItem = item.id;
        } else if (filterInfo.value.type == "value") {
          actualItem = item;
        }

        if (Object.keys(enableStates.value).indexOf(actualItem) < 0) {
          enableStates.value[actualItem] = 0;
        }
        enableStates.value[actualItem]++;
      }
    }
  }
}

const availableItems = computed(() => {
  let filteredItems = props.items;

  filteredItems = filteredItems.filter((item) => {
    if (item.title == "") {
      return false;
    }

    if (
      (quickFilter.value &&
        !item.title
          .toLocaleLowerCase()
          .includes(quickFilter.value?.toLocaleLowerCase())) ||
      !Object.keys(enableStates.value).includes(item.value)
    ) {
      return false;
    } else {
      return true;
    }
  });

  return filteredItems.map((item) => {
    return {
      value: item.value,
      title: item.title,
      disabled: !Object.keys(enableStates.value).includes(item.value),
      count: Object.keys(enableStates.value).includes(item.value)
        ? enableStates.value[item.value]
        : "",
      hidden: false,
    };
  });
});

function selectAll() {
  let modelItems = [];

  for (const item of availableItems.value) {
    if (!item.disabled && !item.hidden) {
      modelItems.push(item.value);
    }
  }

  if (model.value) {
    model.value = [
      ...model.value,
      ...modelItems.filter((item) => model.value.indexOf(item) < 0),
    ];
  } else {
    model.value = [...modelItems];
  }
}
</script>

<template>
  <v-select
    v-model="model"
    :items="availableItems"
    :label="props.title"
    item-title="title"
    item-value="value"
    item-disabled="disabled"
    clearable
    multiple
    class="mt-2 mb-0"
    variant="solo"
    @update:menu="
      quickFilter = '';
      updateEnableStates();
    "
  >
    <template v-slot:prepend-item>
      <div
        style="
          position: sticky;
          top: 0;
          z-index: 2;
          background-color: rgb(var(--v-theme-surface));
        "
        class="pl-2 pr-2 pb-1"
      >
        <v-text-field
          v-if="availableItems?.length > 0"
          v-model="quickFilter"
          prepend-inner-icon="mdi-magnify"
          variant="solo"
          label="Filter"
          density="compact"
          single-line
          clearable
          class="mt-0"
          clear-icon="mdi-close-circle"
        ></v-text-field>

        <v-btn
          v-if="quickFilter?.length > 0 && availableItems?.length"
          class="mb-1"
          block
          variant="tonal"
          color="primary"
          prepend-icon="mdi-check-all"
          @click="selectAll"
          >Select all</v-btn
        >
      </div>
    </template>

    <template v-slot:item="{ props, item }">
      <v-list-item
        v-if="!item.raw.hidden"
        v-bind="props"
        color="primary"
        :disabled="item.raw.disabled"
      >
        <template v-slot:append>
          <span class="ml-2 text-medium-emphasis text-caption">
            {{ item.raw.count }}
          </span>
        </template>
      </v-list-item>
    </template>

    <template v-slot:selection="{ attrs, item, select, selected }">
      <v-chip
        v-bind="attrs"
        :model-value="selected"
        closable
        color="primary"
        @click.capture="remove(item)"
        @click:close.capture="remove(item)"
      >
        {{ item.title }}
      </v-chip>
    </template>
  </v-select>
</template>
