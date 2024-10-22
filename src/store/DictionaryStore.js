import { watch } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { useRouter, useRoute } from "vue-router";
import { useDictionary, reloadDictionary } from '@/composables/useDictionary.js';
import { useDictionaryFilter, serializeFilter, deserializeFilter } from '@/composables/useDictionaryFilter.js';
import { useAssetsCacheManagement } from '@/composables/useAssetsCacheManagement.js';
import getDataByPath from '@/utils/GetDataByPath.js'
import getMainItem from '@/utils/getMainItem.js'
import { useStorage } from '@vueuse/core'

import { i18n } from "@/i18n"

export const useDictionaryStore = defineStore('dictionary', () => {

  const router = useRouter();
  const route = useRoute();

  const dictionary = storeToRefs(useDictionary("/data/data.json", i18n.global.locale))
  const filter = storeToRefs(useDictionaryFilter(dictionary))
  const cache = storeToRefs(useAssetsCacheManagement(i18n.global.locale.value, filter.selectedProjects, dictionary.preloadableAssets))

  function downloadEnqueuedAssets() {
    cache.processQueue.value = true;
  }

  function stopDownloadingEnqueuedAssets() {
    cache.processQueue.value = false;
  }

  function clearAssetsCache() {
    navigator.serviceWorker.controller.postMessage({
      type: "CLEAR_DATA_ASSETS",
    });
  }

  const portalName = useStorage("portal-name", "", localStorage)

  const favorites = {
    add: function (name, url, tableType) {
      let existingIndex = filter.favorites.value.findIndex((f) => f.name == name)
      if (existingIndex >= 0) {
        filter.favorites.value[existingIndex].url = url
        filter.favorites.value[existingIndex].tableType = tableType
      }
      else {
        filter.favorites.value.push(
          {
            name: name,
            useInLearning: false,
            url: url,
            tableType: tableType
          }
        )
      }
    },
    delete(name) {
      let existingIndex = filter.favorites.value.findIndex((f) => f.name == name)
      if (existingIndex >= 0) {
        filter.favorites.value.splice(existingIndex, 1)
      }
    },
    all: filter.favorites.value
  }

  function serializeDictionaryFilter() {
    return serializeFilter(filter)
  }

  function reloadDictionaryData(dictionaryData) {
    reloadDictionary(dictionaryData)
  }

  function setFilters(options, table) {
    const {
      text = "",
      filters = {}
    } = options || {};

    filter.filters.value = filters
    filter.text.value = text
    if (table) {
      filter.table.value = table
    }
  }

  //Returns a list of items from inTableType that reference IDs in ofTableType
  function getReferencesList(idToSearch, ofTableType, inTableType) {

    const pathsToCheck = dictionary.sheetDataDetails.value.filter((detailsItem) =>
      detailsItem.tableType == inTableType &&
      detailsItem.type == 'ref-list' &&
      (detailsItem.referenceToTableType == ofTableType
        // by design we will only fetch data directly in the table, not linked from other tables (this could be enabled by uncommenting the following line)
        //|| detailsItem.referenceToTableType?.referenceToTableType == ofTableType 
      )
    ).map((item) => item.columnName)

    const tablesToCheck = dictionary.tables.value.filter((table) =>
      table.meta.tableType == inTableType &&
      (table.meta.project === undefined || filter.selectedProjects.value.includes(table.meta.project))
    )

    const entriesWithReferences = []

    for (const table of tablesToCheck) {
      for (const entry of table.data) {
        for (const path of pathsToCheck) {
          let data = getDataByPath(entry, path)

          if (data.length > 0 && data.find((dataItem) => dataItem?.id == idToSearch) !== undefined) {
            const mainItem = getMainItem(dictionary.sheetDataDetails.value, inTableType, entry)
            entriesWithReferences.push({ id: entry.id, main: mainItem, project: table.meta.project, languageName: dictionary.projectsMeta.value[table.meta.project].languageName })
            break
          }
        }
      }
    }

    return entriesWithReferences
  }

  function findItem(tableType, index) {
    for (const table of dictionary.tables.value) {
      if (table.meta.tableType == tableType) {
        let found = table.data.find((row) => row.id == index)
        if (found) {
          return found
        }
      }
    }
    return undefined
  }

  // Watches for the dictionary to come ready to save to local storage the portal name, so next time we load the app the portal name can be displayed on the splash screen before the dictionary is loaded
  watch(
    () => dictionary.isReady.value,
    () => {
      if (dictionary.isReady) {
        portalName.value = dictionary.portalName?.value
      }
    }
  )

  //Update the filters when route or query change
  watch(
    () => [route.name, route.query],
    (newValue, oldValue) => {
      const oldName = oldValue[0]
      const newName = newValue[0]

      const oldQuery = oldValue[1]
      const newQuery = newValue[1]

      if ((oldName === undefined) && newName === "search") //we just landed on the page, use existing params
      {
        deserializeFilter(route.query.q, filter)
      }
      else {
        if (oldQuery != newQuery) {
          deserializeFilter(route.query.q, filter)
        }
      }
    }
  )

  //Update the URL when filters change
  watch(
    () => [filter.text, filter.filters, filter.selectedProjects, filter.fuzzinessLevel],
    (newValue) => {
      if (route.name !== "search") {
        return
      }
      if (newValue[0].value == "" && Object.keys(newValue[1].value).length == 0) {
        //return
      }

      router.push({
        name: "search",
        params: { table: filter.table.value },
        query: { q: serializeFilter(filter) },
      });
    },
    { deep: true }
  )

  //Update the filter table on params change
  watch(
    () => route.params,
    (newValue) => {
      if (newValue && newValue.table && newValue.table != filter.table.value) {
        filter.table.value = newValue.table
      }
      if (newValue && newValue.singleViewTable && newValue.singleViewTable != filter.table.value) {
        filter.table.value = newValue.table
      }
    }
  )

  return {
    dictionary,
    filter,
    cache,
    downloadEnqueuedAssets,
    stopDownloadingEnqueuedAssets,
    clearAssetsCache,
    setFilters,
    serializeDictionaryFilter,
    findItem,
    getReferencesList,
    reloadDictionaryData,
    favorites,
  }
})
