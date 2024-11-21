<script setup>
import { computed } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { useRouter, useRoute } from "vue-router";
import { serializeFilter } from "@/composables/useDictionaryFilter.js";

const dictionaryStore = useDictionaryStore();
const router = useRouter();
const route = useRoute();

//list of route names to include, SEPARATOR inserts a divider
const menu = computed(() => {
  const baseMenu = [
    { type: "divider" },
    /* TODO
    {
      title: "mainMenu.learning",
      pathName: "learning",
      icon: "mdi-account-school",
    },
    */
    {
      title: "mainMenu.aboutDictionary",
      pathName: "about-dictionary",
      icon: "mdi-book-information-variant",
    },
    {
      type: "divider",
    },
    {
      title: "mainMenu.aboutAppTitle",
      pathName: "about-app",
      icon: "mdi-information-outline",
    },
    { title: "mainMenu.settings", pathName: "settings", icon: "mdi-cog" },
  ];

  let menu = dictionaryStore.dictionary.menu.map((menuItem) => {
    return {
      title: menuItem.title,
      pathName: "search",
      path: "search/" + menuItem.tableType,
      tableToSearch: menuItem.tableType,
      icon: menuItem.icon,
    };
  });
  return [...menu, ...baseMenu];
});

const expectedTable = computed(() => {
  if (route.name === "search") {
    return route.params.table;
  } else if (route.name === "view") {
    return route.params.singleViewTable;
  }

  return "";
});

const selectedProjects = computed(() => {
  let raw = dictionaryStore.dictionary.projectsMeta;
  let allowed = dictionaryStore.filter.selectedProjects;

  return Object.keys(raw)
    .filter((key) => allowed.includes(key))
    .reduce((obj, key) => {
      obj[key] = raw[key];
      return obj;
    }, {});
  return dictionaryStore.dictionary.projectsMeta.value.filter((p) =>
    dictionaryStore.filter.selectedProjects.value.includes(p.projectId)
  );
});
</script>

<template>
  <v-list density="compact" nav v-for="(item, index) in menu" v-bind:key="index">
    <v-divider v-if="item.type === 'divider'"></v-divider>
    <v-list-item v-else :prepend-icon="item.icon" :title="$t(item.title)" :value="item" :active="item.tableToSearch
        ? item.tableToSearch == expectedTable
        : item.pathName == route.name
      " exact color="primary" @click="
        if (item.tableToSearch) {
        if (
          route.params.table &&
          item.pathName + '-' + item.tableToSearch ==
          route.name + '-' + route.params.table
        ) {
          dictionaryStore.setFilters({
            text: '',
            filters: {},
          });
        }
        router.push({
          name: item.pathName,
          params: { table: item.tableToSearch },
          query: { q: serializeFilter(dictionaryStore.filter) },
        });
      } else {
        router.push({ name: item.pathName });
      }
        "></v-list-item>
  </v-list>
  <v-divider></v-divider>
  <div class="ma-2 text-caption" v-if="dictionaryStore.filter.selectedProjects?.length > 0">
    <div class="font-weight-bold">Open projects</div>
    <ShowMoreItems :items="Object.keys(selectedProjects).map((p) => selectedProjects[p].projectId)
      " :maxItemsShown="3" v-slot="slotProps">
      <div class="ml-2">
        {{ selectedProjects[slotProps.currentItem].projectName }}
      </div>
    </ShowMoreItems>
  </div>
</template>
