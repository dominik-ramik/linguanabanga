<script setup>
import { ref, computed } from "vue";
import { useAppSettingsStore } from "@/store/AppSettingsStore.js";

const props = defineProps(["results"]);
const appSettings = useAppSettingsStore();

const viewType = ref("tree");

const treeCollapsed = ref(false);
const useTreeView = computed(() => {
  return viewType.value === "tree";
});

function getTreefiedBranchTemplate(name, fullPath, currentLevel, matches) {
  return {
    name: name || "",
    fullPath: fullPath || [],
    currentLevel: currentLevel || 0,
    deepChildrenCount: 0,
    items: [],
    children: [],
    matches: matches,
  };
}

const treefiedResults = computed(() => {
  let treefied = getTreefiedBranchTemplate();
  let hasTreefiableItems = false;

  props.results.forEach((result) => {
    if (result.item.indexlevel?.length > 0) {
      hasTreefiableItems = true;
    }

    if (result.item.indexlevel?.length > 0 && useTreeView.value) {
      let accumulator = treefied;
      result.item.indexlevel.forEach((indexlevelItem, index) => {
        let child = accumulator.children.find(
          (accumulatorChild) => accumulatorChild.name == indexlevelItem
        );

        if (child === undefined) {
          //create new branch
          const newChild = getTreefiedBranchTemplate(
            indexlevelItem,
            result.item.indexlevel,
            index,
            result.matches
          );

          accumulator.children.push(newChild);
          child = newChild;
        }

        if (index == result.item.indexlevel.length - 1) {
          child.items.push(result);
        }
        child.deepChildrenCount++;
        accumulator = child;
      });
    } else {
      treefied.deepChildrenCount++;
      treefied.items.push(result);
    }
  });

  return { tree: treefied, hasTreefiableItems };
});
</script>

<template>
  <div
    class="d-flex align-center mb-2 mt-2 flex-wrap"
    v-if="treefiedResults.hasTreefiableItems"
  >
    <div class="d-flex align-center ml-2 mr-4">
      <v-btn-toggle v-model="viewType" mandatory color="primary">
        <v-btn value="list">
          <span class="hidden-sm-and-down">List view</span>

          <v-icon end> mdi-format-list-bulleted </v-icon>
        </v-btn>

        <v-btn value="tree">
          <span class="hidden-sm-and-down">Folder view</span>

          <v-icon end> mdi-file-tree </v-icon>
        </v-btn>
      </v-btn-toggle>
    </div>

    <v-btn v-if="useTreeView" @click="treeCollapsed = !treeCollapsed">
      {{ treeCollapsed ? "Expand all" : "Collapse all" }}
    </v-btn>
  </div>
  <v-divider v-if="treefiedResults.hasTreefiableItems" class="mb-4" />

  <TreefiedSearchResultsTreeBranch
    :branchData="treefiedResults.tree"
    :collapsed="treeCollapsed"
    :itemIcon="
      treefiedResults.hasTreefiableItems
        ? 'mdi-file-document-outline'
        : undefined
    "
  />
</template>
