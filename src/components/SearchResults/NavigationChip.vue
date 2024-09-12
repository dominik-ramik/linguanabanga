<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useDictionaryStore } from "@/store/DictionaryStore.js";

const router = useRouter();
const dictionaryStore = useDictionaryStore();

const props = defineProps([
  "actionType",
  "text",
  "data-id",
  "data-filter-name",
  "data-search-text",
  "data-table-type",
  "data-url",
]);

const icon = computed(() => {
  switch (props.actionType) {
    case "filter":
      return "mdi-tag";
    case "external-url":
      return "mdi-earth";
    case "search":
      return "mdi-magnify";
    case "single-item-view":
      return (
        dictionaryStore.dictionary.menu.find(
          (menuItem) => menuItem.tableType == props.dataTableType
        )?.icon || "mdi-text-box"
      );
    default:
      return "";
  }
});

const action = computed(() => {
  switch (props.actionType) {
    case "filter":
      return () => {
        console.log(props.dataTableType)
        console.log(dictionaryStore.filter)
        let f = {};
        f[props.dataFilterName] = [props.dataId];
        dictionaryStore.setFilters({ filters: f }, props.dataTableType);
      };
    case "external-url":
      return () => {
        window.open(props.dataUrl, "_blank")
         };
    case "search":
      return () => {
        dictionaryStore.setFilters({ text: props.dataSearchText }, props.dataTableType);
      };
    case "single-item-view":
      return () => {
        router.push({
          name: "view",
          params: {
            singleViewTable: props.dataTableType,
            singleViewId: props.dataId,
          },
        });
      };

    default:
      return "";
  }
});
</script>

<style>
.navigation-chip {
  color: rgb(var(--v-theme-primary));
  background-color: rgba(var(--v-theme-primary), 0.1);
  display: inline-block;
  border-radius: 0.25em;
  padding-left: 0.1em;
  padding-right: 0.25em;
}
</style>

<template>
    <span
      class="navigation-chip cursor-pointer ml-0 mb-1"      
      @click="action()"
    >
      <v-icon
        v-if="icon"
        size="x-small"
        style="
          vertical-align: baseline;
          margin-left: 0.1em;
          margin-right: 0.15em;
        "
        >{{ icon }}</v-icon
      >
      <span v-html="props.text"></span>
    </span>
</template>
