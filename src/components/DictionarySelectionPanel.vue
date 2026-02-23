<script setup>
import {
  ref,
  computed,
  watch,
  onUnmounted,
} from "vue";
import { useDictionaryStore } from "@/store/DictionaryStore";
import { useI18n } from "vue-i18n";
import { i18n } from "@/i18n";
import { useRoute } from "vue-router";

const { t } = useI18n();
const dictionaryStore = useDictionaryStore();
const route = useRoute();

const isSearchRoute = computed(() => route.name === "search");

// --- CHIP FILTER LOGIC ---
function extractMenuPathSegments(projects) {
  const levels = [];
  projects.forEach((proj) => {
    if (!proj.menuPath) return;
    const segments = proj.menuPath
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    segments.forEach((seg, idx) => {
      if (!levels[idx]) levels[idx] = new Set();
      levels[idx].add(seg);
    });
  });
  return levels.map((levelSet) =>
    Array.from(levelSet).sort((a, b) => a.localeCompare(b))
  );
}

const allProjects = computed(() => {
  const lang = i18n.global.locale.value;
  const entries = Object.entries(
    dictionaryStore.dictionary.allVersionsProjectsMeta?.[lang]?.projects || {}
  ).map((e) => e[1]);
  return entries.filter((entry) => entry.translations?.includes(lang));
});

const menuPathLevels = computed(() =>
  extractMenuPathSegments(allProjects.value)
);
const selectedChip = ref("All");
const filterChips = computed(() => {
  const chips = [
    { label: t("languageSelectorView.all"), value: "All", level: -1 },
  ];
  menuPathLevels.value.forEach((levelArr, idx) => {
    levelArr.forEach((seg) => {
      chips.push({ label: seg, value: seg, level: idx });
    });
  });
  return chips;
});
const filteredProjects = computed(() => {
  if (selectedChip.value === "All") return allProjects.value;
  return allProjects.value.filter((proj) => {
    if (!proj.menuPath) return false;
    const segments = proj.menuPath.split("/").map((s) => s.trim());
    return segments.includes(selectedChip.value);
  });
});
// Local copy of selected dictionaries
const localSelected = ref(
  Array.isArray(dictionaryStore.filter.selectedProjects)
    ? [...dictionaryStore.filter.selectedProjects]
    : []
);

const rows = computed(() => {
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
        selected: localSelected.value.includes(p.projectId),
      };
    })
    .sort((a, b) => a.dictionaryLabel.localeCompare(b.dictionaryLabel));
});

const noSelection = computed(() => !localSelected.value?.length);

// Modal dialog state for "select more dictionaries?"
const showSelectMoreDialog = ref(false);
const pendingSelection = ref(null);
const showConfirmSelectionBtn = ref(false);

// Watch for changes in local selection
function onToggleSelection(projectId) {
  if (!localSelected.value.includes(projectId)) {
    // Add
    localSelected.value.push(projectId);
    if (isSearchRoute.value) {
      pendingSelection.value = projectId;
      showSelectMoreDialog.value = true;
    }
  } else {
    // Remove
    localSelected.value = localSelected.value.filter((id) => id !== projectId);
    if (!isSearchRoute.value) {
      dictionaryStore.filter.selectedProjects = [...localSelected.value];
    }
  }
}

// Handle dialog response
function handleSelectMoreDialog(answer) {
  showSelectMoreDialog.value = false;
  if (answer === "no") {
    dictionaryStore.filter.selectedProjects = [...localSelected.value];
    showConfirmSelectionBtn.value = false;
  } else if (answer === "yes") {
    // Always show the confirm button after "yes"
    showConfirmSelectionBtn.value = true;
  }
}

function confirmSelection() {
  dictionaryStore.filter.selectedProjects = [...localSelected.value];
  showConfirmSelectionBtn.value = false;
}

// Watch for changes in localSelected (non-search route)
watch(
  localSelected,
  (val) => {
    if (!isSearchRoute.value) {
      dictionaryStore.filter.selectedProjects = [...val];
    }
  },
  { deep: true }
);

// beforeUnmount: merge any outstanding differences into the store
onUnmounted(() => {
  const storeSet = new Set(dictionaryStore.filter.selectedProjects || []);
  const localSet = new Set(localSelected.value || []);
  // Merge: union of both sets
  const merged = Array.from(new Set([...storeSet, ...localSet]));
  dictionaryStore.filter.selectedProjects = merged;
});

// Helper to calculate needed MB for a given projectId
function getProjectNeedsMB(projectId) {
  const lang = i18n.global.locale.value;
  const assets = dictionaryStore.dictionary.preloadableAssets || [];
  let totalBytes = 0;
  for (const asset of assets) {
    if (
      asset.refs &&
      asset.refs[lang] &&
      asset.refs[lang].includes(projectId)
    ) {
      totalBytes += asset.size || 0;
    }
  }
  return Math.ceil(totalBytes / 1024 / 1024);
}

// --- CHIP COLOR LOGIC ---
const chipBgColorForLevel = (level, selected) => {
  // Use HSL for color gradation: primary hue, increasing lightness for higher levels
  // You can tweak these values for your theme
  const baseHue = 220; // blue-ish, adjust as needed
  const baseSat = 80;
  const baseLight = selected ? 40 : 90; // darker if selected, lighter if not
  const step = selected ? 10 : 5; // how much to lighten/darken per level
  const lightness = Math.min(baseLight + level * step, 98);
  const textColor = selected ? "#fff" : "#222";
  return {
    backgroundColor: `hsl(${baseHue}, ${baseSat}%, ${lightness}%)`,
    color: textColor,
    border: selected ? "2px solid #3b4997" : "1px solid #bfc8e6",
    fontWeight: selected ? "bold" : "normal",
  };
};
</script>

<template>


  <div v-if="showConfirmSelectionBtn" class="d-flex justify-center mt-2">
    <v-btn color="primary" @click="confirmSelection">
      {{ t("languageSelectorView.confirmSelection") }}
    </v-btn>
  </div>

  <div class="ma-2 pa-2">
    <v-card-text>
      <!-- Filter chips UI -->
      <v-sheet
        class="mb-2 d-flex flex-row align-center"
        color="surface"
        elevation="0"
        style="border-radius: 6px; width: 100%; flex-wrap: wrap; gap: 8px"
      >
        <span class="font-weight-medium mr-3" style="font-size: 1.1em">
          {{ $t("languageSelectorView.filterByMenuPath") }}
        </span>
        <v-chip-group
          v-model="selectedChip"
          selected-class="chip-selected"
          column
        >
          <v-chip
            v-for="chip in filterChips"
            :key="chip.value + '-' + chip.level"
            :value="chip.value"
            :style="
              chipBgColorForLevel(chip.level, selectedChip === chip.value)
            "
            label
            size="small"
            class="ma-1"
          >
            {{ chip.label }}
          </v-chip>
        </v-chip-group>
      </v-sheet>

      <v-alert v-if="noSelection" type="info" variant="tonal" class="mb-4">
        {{ $t("languageSelectorView.hintNoSelection") }}
      </v-alert>

      <!-- Card/list UI for dictionaries -->
      <v-row dense>
        <v-col
          v-for="item in rows"
          :key="item.id"
          class="min-two-col-xs"
          cols="12"
          xs="6"
          sm="6"
          md="4"
          lg="3"
          xl="2"
        >
          <v-card
            :elevation="localSelected.includes(item.id) ? 8 : 2"
            :color="
              localSelected.includes(item.id) ? 'primary lighten-5' : 'surface'
            "
            class="d-flex flex-column align-start pa-3 dictionary-card dictionary-card--compact"
            @click="onToggleSelection(item.id)"
            style="
              cursor: pointer;
              min-height: 80px;
              margin-left: auto;
              margin-right: auto;
            "
          >
            <div class="d-flex align-center w-100">
              <v-icon
                v-if="localSelected.includes(item.id)"
                color="white"
                class="mr-2"
                size="small"
                >mdi-check-circle</v-icon
              >
              <v-icon v-else color="primary" class="mr-2" size="small"
                >mdi-checkbox-blank-circle-outline</v-icon
              >
              <span class="font-weight-medium" style="font-size: 1.1em">
                {{ item.dictionaryLabel }}
              </span>
            </div>
            <div class="mt-1">
              <v-chip
                size="x-small"
                :color="localSelected.includes(item.id) ? 'white' : 'primary'"
                :text-color="
                  localSelected.includes(item.id) ? 'primary' : undefined
                "
                variant="outlined"
                class="mr-1"
                style="pointer-events: none"
              >
                {{ getProjectNeedsMB(item.id) }} MB
              </v-chip>
            </div>
          </v-card>
        </v-col>
      </v-row>
      <!-- Modal dialog for select more dictionaries -->
      <v-dialog v-model="showSelectMoreDialog" max-width="400">
        <v-card>
          <v-card-title>{{
            t("languageSelectorView.selectMoreTitle")
          }}</v-card-title>
          <v-card-text>{{
            t("languageSelectorView.selectMoreText")
          }}</v-card-text>
          <v-card-actions>
            <v-btn color="primary" @click="handleSelectMoreDialog('yes')">
              {{ t("languageSelectorView.selectMoreYes") }}
            </v-btn>
            <v-btn color="secondary" @click="handleSelectMoreDialog('no')">
              {{ t("languageSelectorView.selectMoreNo") }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-card-text>
  </div>

</template>

<style scoped>
.selected-row {
  background-color: rgba(var(--v-theme-primary), 0.12);
}
.tonal-selected-row {
  background-color: rgba(var(--v-theme-primary), 0.16) !important;
}
.offline-progress-stripe {
  width: 100%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.dictionary-card {
  transition: box-shadow 0.2s, background 0.2s;
}
.dictionary-card--compact {
  max-width: 260px;
  width: 100%;
  min-width: 0;
  margin-left: auto;
  margin-right: auto;
  padding-left: 10px !important;
  padding-right: 10px !important;
}
.dictionary-card:hover {
  box-shadow: 0 4px 16px rgba(33, 150, 243, 0.08);
  background: rgba(var(--v-theme-primary), 0.04);
}

@media (max-width: 600px) {
  .min-two-col-xs {
    flex: 0 0 50% !important;
    max-width: 50% !important;
  }
}
</style>
