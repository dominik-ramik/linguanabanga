<script setup>
import { computed } from 'vue'
import { useDictionaryStore } from '@/store/DictionaryStore'
import { i18n } from '@/i18n'

const dictionaryStore = useDictionaryStore()

// List only the projects available in the current display language
const projects = computed(() => {
  const lang = i18n.global.locale.value
  const entries = Object.entries(
    dictionaryStore.dictionary.allVersionsProjectsMeta[lang].projects
  ).map(e => e[1])

  const currentLanguageProjects = entries.filter(entry =>
    entry.translations?.includes(lang)
  )

  return currentLanguageProjects.sort((a, b) => a.menuPath.localeCompare(b.menuPath))
})

const rows = computed(() => {
  const selected = dictionaryStore.filter.selectedProjects || []
  return projects.value.map(p => {
    const same = p.projectName === p.languageName
    const dictLabel = same ? p.projectName : `${p.projectName} / ${p.languageName}`
    return {
      id: p.projectId,
      placement: p.menuPath,
      dictionaryLabel: dictLabel,
      selected: selected.includes(p.projectId),
    }
  })
})

function toggleSelection(projectId) {
  const selected = dictionaryStore.filter.selectedProjects || []
  if (selected.includes(projectId)) {
    dictionaryStore.filter.selectedProjects = selected.filter(id => id !== projectId)
  } else {
    dictionaryStore.filter.selectedProjects = [...selected, projectId]
  }
}

// Add class resolver for rows
function itemClass(item) {
  return item.selected ? 'selected-row' : ''
}

function itemProps(item) {
  return item.selected ? { class: 'tonal-selected-row' } : {}
}

const headers = computed(() => [
  { title: i18n.global.t('languageSelectorView.placement'), key: 'placement', sortable: true },
  { title: i18n.global.t('languageSelectorView.dictionary'), key: 'dictionaryLabel', sortable: true },
  { title: i18n.global.t('languageSelectorView.action'), key: 'action', sortable: false },
])

const noSelection = computed(() => !dictionaryStore.filter.selectedProjects?.length)
</script>

<template>
  <v-card class="ma-2 pa-2">
    <v-card-title>{{ $t('mainMenu.selectDictionary') }}</v-card-title>
    <v-card-text>
      <v-alert
        v-if="noSelection"
        type="info"
        variant="tonal"
        class="mb-4"
      >
        {{ $t('languageSelectorView.hintNoSelection') }}
      </v-alert>

      <v-data-table
        :headers="headers"
        :items="rows"
        :items-per-page="-1"
        :sort-by="[{ key: 'placement', order: 'asc' }]"
        hover
        hide-default-footer
        :item-props="itemProps"
      >
        <template v-slot:[`item.action`]="{ item }">
          <v-btn
            :variant="item.selected ? 'flat' : 'tonal'"
            color="primary"
            size="small"
            @click="toggleSelection(item.id)"
          >
            {{ item.selected ? $t('languageSelectorView.hide') : $t('languageSelectorView.show') }}
          </v-btn>
        </template>
      </v-data-table>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.selected-row {
  background-color: rgba(var(--v-theme-primary), 0.12);
}

/* Stronger tonal tint matching Vuetify tonal variant logic */
.tonal-selected-row {
  background-color: rgba(var(--v-theme-primary), 0.16) !important;
}
</style>
