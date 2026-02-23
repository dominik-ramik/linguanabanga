<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { useI18n } from "vue-i18n";
import { i18n } from "@/i18n";

const { t, locale } = useI18n();
const dictionaryStore = useDictionaryStore();

// --- CHIP FILTER LOGIC ---

// Recursively extract all unique menu path segments by level
function extractMenuPathSegments(projects) {
  const levels = [];
  projects.forEach((proj) => {
    if (!proj.menuPath) return;
    const segments = proj.menuPath.split("/").map((s) => s.trim()).filter(Boolean);
    segments.forEach((seg, idx) => {
      if (!levels[idx]) levels[idx] = new Set();
      levels[idx].add(seg);
    });
  });
  return levels.map((levelSet) => Array.from(levelSet).sort((a, b) => a.localeCompare(b)));
}

const allProjects = computed(() => {
  const lang = i18n.global.locale.value;
  const entries = Object.entries(
    dictionaryStore.dictionary.allVersionsProjectsMeta?.[lang]?.projects || {}
  ).map((e) => e[1]);
  return entries.filter((entry) => entry.translations?.includes(lang));
});

const menuPathLevels = computed(() => extractMenuPathSegments(allProjects.value));

// Chip state
const selectedChip = ref("All");

// Build chips: "All", then all segments by level, each level sorted
const filterChips = computed(() => {
  const chips = [{ label: t("languageSelectorView.all"), value: "All", level: -1 }];
  menuPathLevels.value.forEach((levelArr, idx) => {
    levelArr.forEach((seg) => {
      chips.push({ label: seg, value: seg, level: idx });
    });
  });
  return chips;
});

// Filtered rows for table
const filteredProjects = computed(() => {
  if (selectedChip.value === "All") return allProjects.value;
  // Find all projects where any segment at any level matches the selected chip
  return allProjects.value.filter((proj) => {
    if (!proj.menuPath) return false;
    const segments = proj.menuPath.split("/").map((s) => s.trim());
    return segments.includes(selectedChip.value);
  });
});

const rows = computed(() => {
  const selected = dictionaryStore.filter.selectedProjects || [];
  // Always show all filtered projects, sorted alphabetically by dictionaryLabel
  return filteredProjects.value
    .map((p) => {
      const same = p.projectName === p.languageName;
      const dictLabel = same
        ? p.projectName
        : `${p.projectName} / ${p.languageName}`;
      return {
        id: p.projectId,
        placement: p.menuPath,
        dictionaryLabel: dictLabel,
        selected: selected.includes(p.projectId),
      };
    })
    .sort((a, b) => a.dictionaryLabel.localeCompare(b.dictionaryLabel));
});

function toggleSelection(projectId) {
  const selected = dictionaryStore.filter.selectedProjects || [];
  if (selected.includes(projectId)) {
    dictionaryStore.filter.selectedProjects = selected.filter(
      (id) => id !== projectId
    );
  } else {
    dictionaryStore.filter.selectedProjects = [...selected, projectId];
  }
}

function itemProps(item) {
  return item.selected ? { class: "tonal-selected-row" } : {};
}

const headers = computed(() => [
  {
    title: t("languageSelectorView.dictionary"),
    key: "dictionaryLabel",
    sortable: true,
  },
  {
    title: t("languageSelectorView.action"),
    key: "action",
    sortable: false,
  },
]);

const noSelection = computed(
  () => !dictionaryStore.filter.selectedProjects?.length
);

// --- Asset cache management ---
const checking = dictionaryStore.cache.checking;
const needsDownloadMB = dictionaryStore.cache.needsDownloadMB;
const checkAssets = dictionaryStore.cache.checkAssets;
const queueBeingProcessed = dictionaryStore.cache.queueBeingProcessed;
const downloadProgress = dictionaryStore.cache.downloadProgress;
const requiredDownloadSize = dictionaryStore.cache.requiredDownloadSize;
const currentlyCachedAssets = dictionaryStore.cache.currentlyCachedAssets;
const processQueue = dictionaryStore.cache.processQueue;

const offlineStripeVisible = ref(false);
const neededResult = ref(null);
const offlineReadySnackbar = ref(false);

// Add this computed for selected projects
const selected = computed(() => dictionaryStore.filter.selectedProjects || []);

// Watch for selection changes and check assets
watch(
  () => [...selected.value],
  async () => {
    offlineStripeVisible.value = true;
    neededResult.value = null;

    if (selected.value.length > 0) {
      // Support both function and computed ref for checkAssets
      let result;
      if (typeof checkAssets === "function") {
        result = await checkAssets();
      } else if (checkAssets && typeof checkAssets.value === "function") {
        result = await checkAssets.value();
      } else {
        result = null;
      }
      neededResult.value = result || { needed: [], neededBytes: 0 };

      if ((result?.needed?.length ?? 0) === 0) {
        offlineReadySnackbar.value = true;
        setTimeout(() => {
          offlineStripeVisible.value = false;
        }, 1400);
      }
    } else {
      offlineStripeVisible.value = false;
      neededResult.value = null;
    }
  },
  { immediate: true }
);

function startCaching() {
  dictionaryStore.cache.processQueue = true;
}
function stopCaching() {
  dictionaryStore.cache.processQueue = false;
}
function clearCache() {
  dictionaryStore.clearAssetsCache();
}

function onSwDownloadComplete() {
  offlineReadySnackbar.value = true;
  setTimeout(() => {
    offlineStripeVisible.value = false;
  }, 1200);
}

onMounted(() => {
  window.addEventListener("OFFLINE_DOWNLOAD_COMPLETE", onSwDownloadComplete);
});
onUnmounted(() => {
  window.removeEventListener("OFFLINE_DOWNLOAD_COMPLETE", onSwDownloadComplete);
});

// Auto-offline-ready switch state, persisted in localStorage
const autoOfflineReady = ref(
  localStorage.getItem("autoOfflineReady") === null
    ? true
    : localStorage.getItem("autoOfflineReady") === "true"
);

watch(autoOfflineReady, (val) => {
  localStorage.setItem("autoOfflineReady", val);
});

// Helper to calculate needed MB for a given projectId
function getProjectNeedsMB(projectId) {
  // Calculate the sum of asset sizes (in MB) for this project in the current language
  const lang = i18n.global.locale.value;
  const assets = dictionaryStore.dictionary.preloadableAssets || [];
  let totalBytes = 0;
  for (const asset of assets) {
    if (asset.refs && asset.refs[lang] && asset.refs[lang].includes(projectId)) {
      totalBytes += asset.size || 0;
    }
  }
  return Math.ceil(totalBytes / 1024 / 1024);
}

// Move all logic and UI into a reusable component
import DictionarySelectionPanel from "@/components/DictionarySelectionPanel.vue";
</script>

<template>
  <DictionarySelectionPanel />
</template>
