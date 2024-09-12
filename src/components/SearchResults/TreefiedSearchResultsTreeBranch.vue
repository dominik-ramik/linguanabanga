<script setup>
import { ref, watch } from "vue";
import { highlightText } from "@/utils/highlightText";
import { useDictionaryStore } from "@/store/DictionaryStore.js";
import { useAppSettingsStore } from "@/store/AppSettingsStore.js";

const appSettings = useAppSettingsStore();
const dictionaryStore = useDictionaryStore();

const props = defineProps(["branchData", "collapsed", "itemIcon"]);

const shouldCollapse = ref(props.collapsed);

watch(
  () => props.collapsed,
  (newValue, oldValue) => {
    shouldCollapse.value = newValue;
  }
);

</script>

<template>
  <TreefiedSearchResultsTreeBranchBody
    v-if="!props.branchData.name"
    :branchData="props.branchData"
    :collapsed="props.collapsed"
    :itemIcon="props.itemIcon"
  />
  <div 
     v-else :class="props.branchData.currentLevel == 0 ? 'ml-2' : 'ml-2'">
    <div
      @click="shouldCollapse = !shouldCollapse"
      class="d-flex cursor-pointer mb-3"
    >
      <v-icon icon="mdi-folder" size="large" class="mr-1"></v-icon>
      <p v-if="props.branchData.name" class="text-h6">
        <span
          v-html="
            highlightText(
              props.branchData?.name,
              props.branchData?.matches?.filter(
                (m) => m.value == props.branchData.name.toLowerCase()
              ),
              dictionaryStore.filter.text,
              appSettings.colorFullMatch,
              appSettings.colorPartialMatch
            )
          "
        ></span>

        <span class="text-disabled"
          >({{ props.branchData.deepChildrenCount }})</span
        >
      </p>
    </div>
    <v-expand-transition>
      <div
        v-if="!shouldCollapse"
        class="pl-4 ml-3"
        style="border-left: 1px solid gray"
      >
        <TreefiedSearchResultsTreeBranchBody
          :branchData="props.branchData"
          :collapsed="props.collapsed"
          :itemIcon="props.itemIcon"
        />
      </div>
    </v-expand-transition>
  </div>
</template>
