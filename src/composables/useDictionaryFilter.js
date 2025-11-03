import { computed, ref, watch } from 'vue'
import getDataByPath from '@/utils/GetDataByPath.js'
import { useStorage } from '@vueuse/core'
import { removeAccents } from "@/utils/removeAccents.js"
import getMainItem from "@/utils/getMainItem.js"
import Fuse from 'fuse.js'

const DEFAULT_FUZZINESS_LEVEL = "strict"

const selectedProjectsGlobal = useStorage('selected-projects', [], localStorage, { mergeDefaults: true })

export function useDictionaryFilter(useDictionary) {
    const fuzzinessLevel = useStorage('search-fuzziness-level', DEFAULT_FUZZINESS_LEVEL, localStorage)

    const dictionary = ref(useDictionary)

    const selectedProjects = selectedProjectsGlobal

    //{ name: "name", useInLearning: false, tableType: "tt", url: "http://localhost..." }
    const favorites = useStorage('favorites', [], localStorage, { mergeDefaults: true })

    const text = ref("")
    const filters = ref({})
    const table = ref(null)

    watch(() => text.value,
        () => {
            if (text.value === undefined || text.value === null || !text.value) {
                text.value = ""
            }
        })


    //Filters currently in use which are not empty
    const activeFilters = computed(() => {
        return Object.keys(filters.value).filter((filterKey) => currentFilters.value.find((cf) => cf.name == filterKey) && filters.value[filterKey].length > 0)
    })

    //All filters existing in the dictionary, tableType property is used to distinguish which filter is pertinent to which tableType
    const allPossibleFilters = computed(() => {
        const filterInfos = []
        if (!dictionary.value.sheetDataDetails) {
            return filterInfos
        }
        for (const meta of dictionary.value.sheetDataDetails) {
            if (meta.filterTitle && meta.filterTitle != "") {
                let possibleValues = []
                if (meta.type == "ref-list") {
                    dictionary.value.tables.find((table) => table.meta.tableType == meta.referenceToTableType).data.map((item) => {
                        let title = getMainItem(dictionary.value.sheetDataDetails, meta.referenceToTableType, item)
                        if (Array.isArray(title)) {
                            title = title.join(" / ")
                        }

                        possibleValues.push({ value: item.id, title: title })
                    })
                }
                else {
                    dictionary.value.tables.find((table) => table.meta.tableType == meta.tableType).data.map((item) => {
                        //let mainItem = meta.columnName
                        //let title = item[mainItem.replaceAll("#", "")]
                        let title = getDataByPath(item, meta.columnName)
                        if (Array.isArray(title)) {
                            title = title.join(" / ")
                        }

                        if (!possibleValues.find((possibleValue) => possibleValue.value == title)) {
                            possibleValues.push({ value: title, title: title })
                        }
                    })
                    //throw "Filters not implemented for other than ref-list " + meta.type + ":" + meta.filterTitle
                }

                filterInfos.push({ type: meta.type == "ref-list" ? "ref" : "value", tableType: meta.tableType, name: meta.columnName.replaceAll("#", ""), title: meta.filterTitle, items: possibleValues.sort((a, b) => a.title?.localeCompare(b.title)) })
            }
        }

        return filterInfos
    })

    //Filters currently usable with the url :table param
    const currentFilters = computed(() => {
        return allPossibleFilters.value.filter((info) => info.tableType == table.value)
    })

    const dataToSearch = computed(() => {
        if (!dictionary.value.tables) {
            return []
        }

        const data = []

        dictionary.value.tables.forEach((currentTable) => {
            if (currentTable.meta.tableType == table.value && (currentTable.meta.project === undefined || selectedProjects.value.includes(currentTable.meta.project))) {
                data.push(...currentTable.data)
            }
        })

        return data
    })

    //Get current layouts in plain format
    const currentFlatLayouts = computed(() => {
        return dictionary.value.layouts?.filter((layout) =>
            layout.tableType == table.value && layout.viewType.includes('search-result')
        ).map((layoutItem) => layoutItem.columnName)
    })

    const filterResults = computed(() => {
        let passedFilter = activeFilters.value.length > 0 ? dataToSearch.value.filter((entry) => {
            let matchesAllFilters = true
            activeFilters.value.forEach((filterName) => {

                let filterDetails = allPossibleFilters.value.find((filter) => filter.name == filterName)

                let thisFilter = filters.value[filterName]
                let thisData = getDataByPath(entry, filterName + (filterDetails.type == "value" ? "" : ".id"))

                let matchesAny = false

                thisData.forEach((thisDataItem) => {
                    if (filterDetails.type == "value") {
                        if (thisFilter.includes(thisDataItem)) {
                            matchesAny = true
                        }
                    }
                    else {
                        if (thisFilter.includes(thisDataItem)) {
                            matchesAny = true
                        }
                    }
                })
                if (!matchesAny) {
                    matchesAllFilters = false
                }
            })

            return matchesAllFilters
        })
            : dataToSearch.value


        if (dictionary.value.isReady) {
            let mainItem = dictionary.value?.sheetDataDetails.find((mainItemMeta) => table.value == mainItemMeta.tableType && mainItemMeta.type == "main")
            let mainPath = mainItem?.columnName.replaceAll("#", "")

            passedFilter.sort((a, b) => {
                let aMainPathData = getDataByPath(a, mainPath)
                let bMainPathData = getDataByPath(b, mainPath)

                if (!aMainPathData || !bMainPathData || aMainPathData.length == 0 || bMainPathData.length == 0) {
                    //console.log("Cannot find dataPath:", mainPath, a, b)
                    return 0
                }

                return aMainPathData[0].localeCompare(aMainPathData[0])
            })
        }

        return passedFilter
    })

    const fuseSearchKeys = computed(() => {
        //we need to take into account the current layout so we don't search for values that are not displayed
        let pathsToMatch = []
        if (dictionary.value && dictionary.value.isReady) {
            for (const infoKey of Object.keys(dictionary.value?.sheetDataDetails)) {
                const info = dictionary.value.sheetDataDetails[infoKey]
                if (info.tableType == table.value) {
                    if (info.searchPriority !== "" && info.searchPriority > 0) {
                        if (currentFlatLayouts.value.includes(info.columnName)) {
                            let columnNameHashless = info.columnName.replaceAll("#", "")
                            if (pathsToMatch.find((path) => columnNameHashless === path.name) === undefined) {
                                pathsToMatch.push({
                                    name: columnNameHashless,
                                    priority: 1.0 / parseFloat(info.searchPriority)
                                })
                            }
                        }
                    }
                }
            }
        }

        return pathsToMatch

    })

    const results = computed(() => {

        let allResults = []

        if (text.value == "") {
            //if not searching by text, return values ordered alphabetically by main item
            allResults = filterResults.value.map((result) => {
                return { item: result, score: 0, refIndex: result.id }
            })

            allResults = allResults.sort((a, b) => {
                let mainA = getMainItem(dictionary.value.sheetDataDetails, table.value, a.item)[0]
                let mainB = getMainItem(dictionary.value.sheetDataDetails, table.value, b.item)[0]

                // items with undefined main item will get shown at the end of the list
                if (mainA === undefined) {
                    return 1
                }
                if (mainB === undefined) {
                    return -1
                }

                return mainA.localeCompare(mainB)
            })
        }
        else {
            //default values for fuzzy search with Fuse
            let fuzziness = 0.5
            let fidelity = 0.7
            let cutoffScore = 0.55

            switch (fuzzinessLevel.value) {
                case "exact":
                    fuzziness = 0.0
                    fidelity = 1.0
                    cutoffScore = 0.55
                    break;
                case "strict":
                    fuzziness = 0.4
                    fidelity = 0.5
                    cutoffScore = 0.7
                    break;
                case "liberal":
                    fuzziness = 0.7
                    fidelity = 0.4
                    cutoffScore = 0.9
                    break;

                default:
                    break;
            }

            let minMatchCharLength = 0
            if (text.value) {
                minMatchCharLength = (text.value.length > 3 ? Math.round(text.value.length * fidelity) : text.value.length - 1)
            }

            const options = {
                isCaseSensitive: false,
                threshold: fuzziness,
                includeScore: true,
                shouldSort: true,
                includeMatches: true,
                findAllMatches: false,
                useExtendedSearch: false,
                ignoreLocation: true,
                minMatchCharLength: minMatchCharLength,
                keys: fuseSearchKeys.value,
                getFn: ((obj, path) => {
                    let value = Fuse.config.getFn(obj, path)
                    if (Array.isArray(value)) {
                        return value.map(el => removeAccents(el))
                    }
                    else {
                        return removeAccents(value)
                    }
                })
            }

            const fuse = new Fuse(filterResults.value, options)

            allResults = fuse.search(removeAccents(text.value)).filter(result => result.score <= cutoffScore)
        }

        return allResults
    })

    return {
        fuzzinessLevel,
        results,
        filters,
        activeFilters,
        currentFilters,
        selectedProjects,
        text,
        table,
        favorites,
    }
}

export function serializeFilter(filter) {
    const filtersToSerialize = {}

    if (filter.text.value && filter.text.value.length > 0) {
        filtersToSerialize["text"] = filter.text.value
        filtersToSerialize["search"] = filter.fuzzinessLevel.value || DEFAULT_FUZZINESS_LEVEL
    }
    if (filter.filters.value && Object.keys(filter.filters.value).length > 0) {
        let f = {}
        Object.keys(filter.filters.value).forEach((filterKey) => {
            if (filter.filters.value[filterKey].length > 0) {
                f[filterKey] = filter.filters.value[filterKey]
            }
        })
        if (Object.keys(f).length > 0) {
            filtersToSerialize["filters"] = f
        }
    }
    if (filter.selectedProjects.value && filter.selectedProjects.value.length > 0) {
        filtersToSerialize["selectedProjects"] = filter.selectedProjects.value
    }
    else {
        const projects = useStorage('selected-projects', [], localStorage)
        filtersToSerialize["selectedProjects"] = projects.value
    }

    return JSON.stringify(filtersToSerialize)
}

export function deserializeFilter(json, filter) {
    let deserializedFilters = {}

    try {
        deserializedFilters = JSON.parse(json || "{}")
    }
    catch (err) {
        deserializedFilters = {}
    }

    if (deserializedFilters.text && deserializedFilters.text.length > 0) {
        filter.text.value = deserializedFilters.text
    }
    else {
        filter.text.value = ""
    }

    if (deserializedFilters.filters) {
        filter.filters.value = deserializedFilters.filters
    }
    else {
        filter.filters.value = {}
    }

    if (deserializedFilters.selectedProjects && deserializedFilters.selectedProjects.length > 0) {
        filter.selectedProjects.value = deserializedFilters.selectedProjects
    }

    if (deserializedFilters.search) {
        filter.fuzzinessLevel.value = deserializedFilters.search
    }
    else {
        filter.fuzzinessLevel.value = DEFAULT_FUZZINESS_LEVEL
    }
}