<script setup>
import { computed, unref } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { useRouter, useRoute } from "vue-router";
import { serializeFilter } from "@/composables/useDictionaryFilter.js";
import { inferLocale } from "@/i18n";

const dictionaryStore = useDictionaryStore();
const router = useRouter();
const route = useRoute();

// Helper: safely unwrap the dictionary and any nested ref/computed properties
function getDictProp(prop) {
  const dict = unref(dictionaryStore.dictionary);
  if (!dict) return undefined;
  const val = dict[prop];
  // If the property is a ref/computed, unref it, otherwise return as-is
  return val && typeof val === "object" && "value" in val ? unref(val) : val;
}

// Small computed wrapper for template use (boolean or other primitive)
const isReadyDisplay = computed(() => !!getDictProp("isReady"));

// Replace direct console access with safe unwrapping for debugging
console.log("dictionaryStore.dictionary (unwrapped):", unref(dictionaryStore.dictionary));
console.log("dictionaryStore.dictionary.isReady (safe):", getDictProp("isReady"));
console.log("dictionaryStore.dictionary.menu (safe):", getDictProp("menu"));

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
      title: "mainMenu.aboutAppTitle",
      pathName: "about-app",
      icon: "mdi-information-outline",
    },
    {
      type: "divider",
    },
    {
      title: "mainMenu.selectDictionary",
      pathName: "select-dictionary",
      icon: "mdi-book-alphabet",
    },
    { title: "mainMenu.settings", pathName: "settings", icon: "mdi-cog" },
  ];

  // Guard: check if menu is defined (use helper to unwrap nested refs)
  const menuData = getDictProp("menu");
  console.log("Menu data:", menuData);

  if (!menuData || !Array.isArray(menuData) || menuData.length === 0) {
    return baseMenu.filter((item) => item.pathName == "settings");
  }

  let menu = menuData.map((menuItem) => {
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

// Helper: unwrap selectedProjects from the filter (works if it's a ref or plain array)
function getAllowedProjectIds() {
  const rawAllowed = dictionaryStore.filter?.selectedProjects;
  if (!rawAllowed) return [];
  const unwrapped = unref(rawAllowed);
  if (!Array.isArray(unwrapped)) return [];
  // normalize to strings to avoid type-mismatch when comparing to object keys
  return unwrapped.map((v) => String(v));
}

// Replace previous selectedProjects computed (object map) with an array of project objects
const selectedProjects = computed(() => {
  const isReady = getDictProp("isReady");
  if (!isReady) return [];

  const raw = getDictProp("projectsMeta");
  if (!raw || typeof raw !== "object") return [];

  const allowedIds = getAllowedProjectIds();
  if (!allowedIds.length) return [];

  // raw is assumed to be an object keyed by project id; filter and return an array of project objects
  return Object.keys(raw)
    .filter((key) => allowedIds.includes(String(key)))
    .map((key) => {
      const proj = raw[key] || {};
      // ensure project has projectId and projectName available to template
      return {
        projectId: proj.projectId ?? key,
        projectName: proj.projectName ?? proj.name ?? "",
        // keep original object if needed
        ...proj,
      };
    });
});

function openGithubRepo() {
  window.open("https://github.com/dominik-ramik/linguanabanga", "_blank");
}

// navigation helper: use named routes and include locale param + query for search
function navigateToItem(item) {
  const locale = route.params.locale || inferLocale();

  if (item.tableToSearch) {
    // If already on same search route/table, reset filters and re-push query
    const sameRoute =
      route.name === "search" && route.params.table === item.tableToSearch;
    if (sameRoute) {
      dictionaryStore.setFilters({
        text: "",
        filters: {},
      });
    }
    router.push({
      name: "search",
      params: { locale, table: item.tableToSearch },
      query: { q: serializeFilter(dictionaryStore.filter) },
    });
    return;
  }

  // Handle named routes for other pages (about-dictionary uses name 'about-dictionary')
  router.push({
    name: item.pathName,
    params: { locale },
  });
}
</script>

<template>
  <v-list density="compact" nav>
    <template v-for="(item, index) in menu" :key="index">
      <v-divider v-if="item.type === 'divider'"></v-divider>
      <v-list-item
        v-else
        :prepend-icon="item.icon"
        :title="$t(item.title)"
        :value="item"
        :active="
          item.tableToSearch
            ? item.tableToSearch == expectedTable
            : item.pathName == route.name
        "
        exact
        color="primary"
        @click="navigateToItem(item)"
      ></v-list-item>
    </template>
  </v-list>
  <v-divider></v-divider>
  <div class="ma-2 text-caption">
    Powered by
    <span
      class="font-weight-bold"
      style="cursor: pointer"
      @click="openGithubRepo"
      >{{ $t("appName") }}</span
    >
  </div>

  <!--
    Show projects when selectedProjects array has items.
    Pass the array of project objects into ShowMoreItems and render currentItem.projectName.
  -->
  <div class="ma-2 text-caption" v-if="selectedProjects.length > 0">
    <div class="font-weight-bold">Open projects</div>
    <ShowMoreItems
      :items="selectedProjects"
      :maxItemsShown="3"
      v-slot="slotProps"
    >
      <div class="ml-2">
        {{ slotProps.currentItem.projectName }}
      </div>
    </ShowMoreItems>
  </div>
</template>
