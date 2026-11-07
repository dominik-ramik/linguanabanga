import { computed, ref, watch, isRef, unref } from 'vue'
import getDataByPath from '@/utils/GetDataByPath.js'
import { useStorage } from '@vueuse/core'
import getMainItem from "@/utils/getMainItem.js"
import {
    DEFAULT_SEARCH_MODE,
    buildTextSearchIndex,
    compareSortKeys,
    normalizeQuery,
    searchText,
} from '@/utils/textSearch.js'

const DEFAULT_FUZZINESS_LEVEL = DEFAULT_SEARCH_MODE

const selectedProjectsGlobal = useStorage('selected-projects', [], localStorage, { mergeDefaults: true })

// ---------------------------------------------------------------------------------------------------------------------
// Media filter helpers (audio / image "all | with | without" selectors)
// ---------------------------------------------------------------------------------------------------------------------
const MEDIA_MODES = ['all', 'with', 'without']

function normalizeMediaMode(mode) {
    return MEDIA_MODES.includes(mode) ? mode : 'all'
}

// false (default) = historical behaviour: an entry counts as having media when the layout path yields any non-empty node.
// true            = stricter: the node must really hold a file (node.source). E.g. a recording node that lists only a
//                   speaker but no audio file would then NOT count as "with audio".
const MEDIA_NODE_MUST_HAVE_SOURCE = true

function isFilled(value) {
    return value != null && value !== ''
}

function nodeHasSource(value) {
    if (Array.isArray(value)) return value.some(nodeHasSource)
    if (value && typeof value === 'object') return nodeHasSource(value.source)
    return isFilled(value) && (typeof value !== 'string' || value.trim() !== '')
}

// `values` is what getDataByPath() returns for one layout path: a flat array of the terminal nodes found
// (strings for file paths, or objects such as { source: ... } when the layout points at the wrapping node).
function hasMediaValue(values) {
    const list = Array.isArray(values) ? values : (values == null ? [] : [values])
    return list.some((value) => MEDIA_NODE_MUST_HAVE_SOURCE ? nodeHasSource(value) : isFilled(value))
}

const warnedMediaPaths = new Set()

// True when the entry has media at ANY of the given data paths. A path that cannot be read is reported once and counted
// as "no media" for that entry instead of making the whole results computation throw (which freezes the list).
function entryHasMedia(entry, paths) {
    for (const path of paths) {
        try {
            if (hasMediaValue(getDataByPath(entry, path))) return true
        } catch (err) {
            if (!warnedMediaPaths.has(path)) {
                warnedMediaPaths.add(path)
                console.warn('[MediaFilter] Could not read media path "' + path + '", treating it as empty', err)
            }
        }
    }
    return false
}

export function useDictionaryFilter(useDictionary) {
    const fuzzinessLevel = useStorage('search-fuzziness-level', DEFAULT_FUZZINESS_LEVEL, localStorage)

    const dictionary = ref(useDictionary)

    // may be a raw ref or already unwrapped depending on how the dictionary was wrapped
    const sheetDataDetails = () => unref(dictionary.value?.sheetDataDetails)

    const selectedProjects = selectedProjectsGlobal

    //{ name: "name", useInLearning: false, tableType: "tt", url: "http://localhost..." }
    const favorites = useStorage('favorites', [], localStorage, { mergeDefaults: true })

    const text = ref("")
    const searchMainEntryOnly = ref(false)
    const filters = ref({})
    const table = ref(null)
    const mediaFilters = ref({ audio: 'all', image: 'all' })

    const hasMainEntry = computed(() => {
        if (!dictionary.value?.isReady || !sheetDataDetails()) return false;
        return sheetDataDetails().some(
            (meta) => table.value === meta.tableType && meta.type === "main"
        );
    });

    watch(hasMainEntry, (newVal) => {
        if (!newVal) {
            searchMainEntryOnly.value = false;
        }
    });

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
        if (!sheetDataDetails()) {
            return filterInfos
        }
        for (const meta of sheetDataDetails()) {
            if (meta.filterTitle && meta.filterTitle != "") {
                let possibleValues = []
                if (meta.type == "ref-list") {
                    dictionary.value.tables.find((table) => table.meta.tableType == meta.referenceToTableType).data.map((item) => {
                        let title = getMainItem(sheetDataDetails(), meta.referenceToTableType, item)
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

        return dictionary.value.tables
            .filter((currentTable) => currentTable.meta.tableType == table.value && (currentTable.meta.project === undefined || selectedProjects.value.includes(currentTable.meta.project)))
            .flatMap((currentTable) => currentTable.data)
    })

    //Get current layouts in plain format
    const currentFlatLayouts = computed(() => {
        return dictionary.value.layouts?.filter((layout) =>
            layout.tableType == table.value && layout.viewType.includes('search-result')
        ).map((layoutItem) => layoutItem.columnName)
    })

    // Pre-compute media data paths from layout metadata to avoid recalculating inside the filter loop
    const currentMediaLayoutPaths = computed(() => {
        const paths = { audio: [], image: [] }
        const layouts = dictionary.value.layouts
        if (!layouts) {
            console.debug('[MediaFilter] No layouts found in dictionary')
            return paths
        }
        const currentTable = table.value
        console.debug('[MediaFilter] Computing media layout paths for table:', currentTable, '| Total layouts:', layouts.length)
        for (let i = 0; i < layouts.length; i++) {
            const layout = layouts[i]
            if (layout.tableType !== currentTable) continue
            const viewTypes = layout.viewType
            if (!viewTypes || !viewTypes.includes('search-result')) continue
            const renderAs = layout.renderAs
            if (renderAs === 'audio') {
                if (!paths.audio.includes(layout.columnName)) paths.audio.push(layout.columnName)
                console.debug('[MediaFilter]   Found audio layout:', layout.columnName)
            } else if (renderAs === 'image' || renderAs === 'picture') {
                if (!paths.image.includes(layout.columnName)) paths.image.push(layout.columnName)
                console.debug('[MediaFilter]   Found image layout:', layout.columnName, '(renderAs:', renderAs, ')')
            }
        }
        console.debug('[MediaFilter] Result paths — audio:', paths.audio, 'image:', paths.image)
        return paths
    })

    const hasMediaFiltersAvailable = computed(() => {
        const p = currentMediaLayoutPaths.value
        const available = p.audio.length > 0 || p.image.length > 0
        console.debug('[MediaFilter] hasMediaFiltersAvailable:', available)
        return available
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


        // Apply media filters in a single pass when at least one is active
        const mf = unref(mediaFilters)
        const audioMode = mf.audio
        const imageMode = mf.image
        console.debug('[MediaFilter] filterResults — audioMode:', audioMode, 'imageMode:', imageMode, 'entries before media filter:', passedFilter.length)
        if (audioMode !== 'all' || imageMode !== 'all') {
            const audioPaths = currentMediaLayoutPaths.value.audio
            const imagePaths = currentMediaLayoutPaths.value.image
            const beforeCount = passedFilter.length
            passedFilter = passedFilter.filter((entry) => {
                if (audioMode !== 'all' && audioPaths.length > 0) {
                    const hasAudio = entryHasMedia(entry, audioPaths)
                    if (audioMode === 'with' && !hasAudio) return false
                    if (audioMode === 'without' && hasAudio) return false
                }
                if (imageMode !== 'all' && imagePaths.length > 0) {
                    const hasImage = entryHasMedia(entry, imagePaths)
                    if (imageMode === 'with' && !hasImage) return false
                    if (imageMode === 'without' && hasImage) return false
                }
                return true
            })
            console.debug('[MediaFilter] filterResults — entries after media filter:', passedFilter.length, '(removed', beforeCount - passedFilter.length, ')')
        }

        // Ordering is decided in `results` (see below), not here.
        return passedFilter
    })

    // Columns the full-text search looks at: every column with a positive `searchPriority` that is also part of the
    // search-result layout. weight = 1 / searchPriority, so a LOWER priority number is a MORE important column and
    // ranks higher inside a match tier. (Fuse only understands `weight`; the old `priority` property was silently ignored.)
    const searchKeys = computed(() => {
        const details = sheetDataDetails()
        if (!dictionary.value?.isReady || !Array.isArray(details)) {
            return []
        }

        const layoutColumns = new Set(currentFlatLayouts.value ?? [])
        const weightByPath = new Map()

        for (const info of details) {
            if (info.tableType != table.value || !layoutColumns.has(info.columnName)) {
                continue
            }

            const priority = Number(info.searchPriority)
            if (!(priority > 0)) {
                continue
            }

            const path = info.columnName.replaceAll("#", "")
            const weight = 1.0 / priority
            if (weight > (weightByPath.get(path) ?? 0)) {
                weightByPath.set(path, weight)
            }
        }

        return [...weightByPath].map(([name, weight]) => ({ name, weight }))
    })

    const actualSearchKeys = computed(() => {
        // "Entry starts with" mode searches the main column only
        if (searchMainEntryOnly.value && hasMainEntry.value && dictionary.value?.isReady) {
            const mainItem = sheetDataDetails().find(
                (meta) => table.value === meta.tableType && meta.type === "main"
            )
            if (mainItem) {
                return [{ name: mainItem.columnName.replaceAll("#", ""), weight: 1 }]
            }
        }
        return searchKeys.value
    })

    // Main-entry text of every entry, computed once per dataset. Used to list entries alphabetically and to break
    // ties between equally ranked search results (reading it inside a sort comparator is O(n log n) path lookups).
    const mainEntrySortKeys = computed(() => {
        const sortKeys = new Map()
        const details = sheetDataDetails()
        if (!dictionary.value?.isReady || !Array.isArray(details)) {
            return sortKeys
        }

        for (const item of dataToSearch.value) {
            const main = getMainItem(details, table.value, item)?.[0]
            sortKeys.set(item, typeof main === "string" ? main : undefined)
        }
        return sortKeys
    })

    // Searchable text of every entry, extracted and normalized once. It is rebuilt only when the data or the
    // searched columns change, NOT on every keystroke or filter change. Lazy: nothing is built until a text search runs.
    const searchIndex = computed(() => buildTextSearchIndex(dataToSearch.value, actualSearchKeys.value))

    const results = computed(() => {
        const query = normalizeQuery(text.value)
        const sortKeys = mainEntrySortKeys.value
        const getSortKey = (item) => sortKeys.get(item)

        if (query === "") {
            //if not searching by text, return values ordered alphabetically by main item (items without one go last)
            return [...filterResults.value]
                .sort((a, b) => compareSortKeys(getSortKey(a), getSortKey(b)))
                .map((item) => ({ item, score: 0, refIndex: item.id, matches: [] }))
        }

        // Ranked best-first (see utils/textSearch.js for the tiers); exact/strict/liberal only differ in whether and
        // how loosely the last, typo-tolerant tier is applied.
        return searchText(searchIndex.value, {
            query,
            candidates: filterResults.value,
            mode: fuzzinessLevel.value,
            startsWithOnly: searchMainEntryOnly.value && hasMainEntry.value,
            getSortKey,
        })
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
        searchMainEntryOnly,
        hasMainEntry,
        mediaFilters,
        currentMediaLayoutPaths,
        hasMediaFiltersAvailable,
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

    if (filter.searchMainEntryOnly && filter.searchMainEntryOnly.value) {
        filtersToSerialize["mainOnly"] = "1"
    }

    if (filter.mediaFilters) {
        const mf = unref(filter.mediaFilters)
        console.debug('[MediaFilter] serializeFilter — mediaFilters:', mf)
        if (mf && (mf.audio !== 'all' || mf.image !== 'all')) {
            filtersToSerialize["media"] = {
                audio: mf.audio,
                image: mf.image,
            }
        }
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

    filter.searchMainEntryOnly.value = deserializedFilters.mainOnly === "1"

    if (filter.mediaFilters) {
        const newMf = (deserializedFilters.media && typeof deserializedFilters.media === 'object')
            ? { audio: normalizeMediaMode(deserializedFilters.media.audio), image: normalizeMediaMode(deserializedFilters.media.image) }
            : { audio: 'all', image: 'all' }
        console.debug('[MediaFilter] deserializeFilter — applying:', newMf)
        if (isRef(filter.mediaFilters)) {
            filter.mediaFilters.value = newMf
        } else {
            // Pinia reactive proxy — mutate in place
            filter.mediaFilters.audio = newMf.audio
            filter.mediaFilters.image = newMf.image
        }
    }
}