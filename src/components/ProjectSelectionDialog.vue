<script setup>
import { ref, computed, watch } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { i18n } from "@/i18n";

const dictionaryStore = useDictionaryStore();

const pathSortedProjects = computed(() => {
  let entries = Object.entries(
    dictionaryStore.dictionary.allVersionsProjectsMeta[i18n.global.locale.value]
      .projects
  ).map((entry) => entry[1]);

  let currentLanguageProjects = entries.filter((entry) =>
    entry.translations?.includes(i18n.global.locale.value)
  );

  return currentLanguageProjects.sort((a, b) => {
    return a.menuPath.localeCompare(b.menuPath);
  });
});

const selectedProjectsFullDetails = computed(() => {
  if (
    !dictionaryStore.filter.selectedProjects ||
    dictionaryStore.filter.selectedProjects.length == 0
  ) {
    return {};
  }

  return Object.values(dictionaryStore.dictionary.projectsMeta).filter(
    (projectMeta) =>
      dictionaryStore.filter.selectedProjects.includes(projectMeta.projectId)
  );
});

const pathsToTree = computed(() => {
  let entries = pathSortedProjects.value;

  let tree = []
  let idCounter = 0;

  for (const entry of entries) {
    const pathSegments = entry.menuPath.split("/");

    let currentTreeNodeChildren = tree
    for (const segment of pathSegments) {
      if (!currentTreeNodeChildren.find(node => node.title == segment)) {
        currentTreeNodeChildren.push({ id: idCounter, title: segment, children: [] })
        idCounter++;
      }

      currentTreeNodeChildren = currentTreeNodeChildren.find(node => node.title == segment).children;
    }
    currentTreeNodeChildren.push({ id: entry.projectId, title: entry.languageName, type: "dictionary" })
  }

  return tree
});

watch(
  () => pathSortedProjects.value,
  (newValue) => {
    // If we have only one dictionary project, select it by default
    if (
      newValue.length == 1 &&
      dictionaryStore.filter.selectedProjects?.length == 0
    ) {
      dictionaryStore.filter.selectedProjects = newValue[0].projectId;
    }
  },
  { immediate: true }
);

const isActive = ref(true);
</script>

<template>
  <v-dialog max-width="500">
    <template v-slot:activator="{ props: activatorProps }">
      <div>
        <div>
          <v-chip color="primary" v-for="project in selectedProjectsFullDetails" v-bind:key="project" class="mr-1">{{
            project.projectName }}</v-chip>
        </div>
        <v-btn prepend-icon="mdi-book-alphabet" v-bind="activatorProps" class="ma-3 mt-5" color="primary">Select
          dictionaries</v-btn>
      </div>
    </template>

    <template v-slot:default="{ isActive }">
      <v-card title="Dictionary selection">
        <v-card-text style="max-height: 80vh; min-height: 80vh; overflow-y: auto;">
          <div class="mb-2">
            Select one or several dictionaries you want to search through
          </div>
            <v-treeview :items="pathsToTree" v-model:selected="dictionaryStore.filter.selectedProjects"
              density="compact" item-value="id" select-strategy="classic" selectable></v-treeview>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text="Close" @click="isActive.value = false"></v-btn>
        </v-card-actions>
      </v-card>
    </template>
  </v-dialog>
</template>
