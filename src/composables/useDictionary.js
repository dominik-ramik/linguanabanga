import { computed, shallowRef } from 'vue'
import axios from "axios";

const dictionaryData = shallowRef(null)

export function useDictionary(jsonDataUrl, langCode) {
    const lang = computed(() => {
        if (Object.keys(dictionaryData.value?.versions).includes(langCode.value)) {
            return langCode.value
        }
        else {
            // No translation in this language
            return dictionaryData.value?.general.defaultLanguageVersion
        }
    })

    const isReady = computed(() => {
        return dictionaryData.value != null
    })

    const preloadableAssets = computed(() => {
        if (isReady.value) {
            return dictionaryData.value?.general.preloadableAssets
        }
        else {
            return undefined
        }
    })

    const thisVersion = computed(() => {
        if (isReady.value) {
            return dictionaryData.value?.versions[lang.value]
        }
        else {
            return undefined
        }
    })

    const specialCharacters = computed(() => {
        let lettersByProject = {}
        let allLetters = []

        for (const projectTag in projectsMeta.value) {
            const project = projectsMeta.value[projectTag]
            const letters = project.specialLetters ? project.specialLetters.split(" ") : []
            
            lettersByProject[projectTag] = []

            letters.forEach((letter) => {
                if (!lettersByProject[projectTag].includes(letter)) {
                    lettersByProject[projectTag].push(letter)
                }
                if (!allLetters.includes(letter)) {
                    allLetters.push(letter)
                }
            })
            lettersByProject[projectTag].sort()
        }
        allLetters.sort()

        return { all: allLetters, byProject: lettersByProject }
    })

    const allVersionsProjectsMeta = computed(() => {
        if (isReady.value) {
            let allProjects = {}
            let versionLangCodes = Object.keys(dictionaryData.value?.versions)
            if (versionLangCodes) {
                versionLangCodes.forEach((versionLangCode) => {
                    allProjects[versionLangCode] = {
                        languageInfo: dictionaryData.value?.general.supportedLanguages.find((lang) => lang.code == versionLangCode),
                        projects: dictionaryData.value?.versions[versionLangCode].projectsMeta
                    }
                })
            }

            console.log(allProjects)

            return allProjects
        }
        else {
            return undefined
        }
    })

    const projectsMeta = computed(() => {
        return thisVersion.value?.projectsMeta
    })

    const tables = computed(() => {
        return thisVersion.value?.tables
    })

    const layouts = computed(() => {
        return portalMeta.value?.layouts
    })

    const supportedLanguages = computed(() => {
        return dictionaryData.value?.general.supportedLanguages
    })

    const menu = computed(() => {
        return portalMeta.value?.menu
    })

    const sheetDataDetails = computed(() => {
        return portalMeta.value?.sheetDataDetails
    })

    const portalMeta = computed(() => {
        return thisVersion.value?.portalMeta
    })

    const portalName = computed(() => {
        return portalMeta.value?.name
    })

    const portalAbout = computed(() => {
        return portalMeta.value?.about
    })

    const shortcodes = computed(() => {
        return portalMeta.value?.shortcodes
    })


    function fetch(jsonDataUrl) {
        axios
            .get(jsonDataUrl)
            .then(function (response) {
                // handle success
                reloadDictionary(response.data)
                console.log(dictionaryData.value)

                window.setTimeout(() => {
                    //if timeout needed for demo purposes put loadDictionary here
                }, 4000);
            })
            .catch(function (error) {
                // handle error
                console.log(error);
            })
            .finally(function () {
                // always executed
            })
    }


    fetch(jsonDataUrl)

    return {
        preloadableAssets,
        layouts,
        tables,
        portalName,
        portalAbout,
        isReady,
        specialCharacters,
        projectsMeta,
        sheetDataDetails,
        allVersionsProjectsMeta,
        supportedLanguages,
        shortcodes,
        menu,
    }
}

export function reloadDictionary(newDictionaryData) {
    dictionaryData.value = dictionaryData.value = unpackReferences(newDictionaryData)
}

export function unpackReferences(data, logFn, simulateOnly) {
    if (simulateOnly === undefined) {
        //simulated run doesn't alter the data, only checks them for corectedness
        simulateOnly = false
    }

    //unpacks database to link records using ref-list

    //for each langauge version
    for (const languageCode in data.versions) {
        let version = data.versions[languageCode]

        let thisSheetDataDetails = data.versions[languageCode].portalMeta.sheetDataDetails

        //for each table in the version link the references to the actual record that is referenced
        for (const table of version.tables) {
            let references = thisSheetDataDetails.filter((detailsItem) => detailsItem.tableType == table.meta.tableType && detailsItem.type == "ref-list")

            for (const entry of table.data) {

                entry.__meta = {}

                for (const reference of references) {
                    let referencedTableData = []
                    if (reference.referenceToTableType == table.meta.tableType) {
                        //this is a self-referencing table
                        referencedTableData = table.data
                    }
                    else {
                        // we need to add data from all tables with the tableType referenced (e.g. dictionary could contain several projects/tables)
                        version.tables.filter((table) => table.meta.tableType == reference.referenceToTableType).forEach((table) => {
                            referencedTableData.push(...table.data)
                        })
                    }

                    linkReference(entry, reference.columnName.replaceAll("#", ""), referencedTableData, reference.referenceToTableType, simulateOnly)
                }

                entry.__meta.table = table.meta
                entry.__meta.project = data.versions[languageCode].projectsMeta[table.meta.project]
            }
        }

        //now unpack the sheetDataDetails to reflect the new data structure
        let alreadyExpandedSelfs = []
        let sheetDataEntriesToZeroSearchPriority = []

        for (let i = 0; i < thisSheetDataDetails.length; i++) {
            const sheetDataEntry = thisSheetDataDetails[i]

            if (sheetDataEntry.type == "ref-list") {
                //add an "array" entry¨

                if (sheetDataEntry.tableType == undefined) {
                    continue
                }

                thisSheetDataDetails.push(createSkeletonMeta(
                    {
                        table: sheetDataEntry.tableType,
                        columnName: sheetDataEntry.columnName + "#",
                        title: "",
                        type: "",
                        referenceToTableType: {},
                        searchPriority: 0
                    }))

                if (sheetDataEntry.referenceToTableType == sheetDataEntry.tableType) {
                    //This is a case of a self-referencing table
                    let selfKey = sheetDataEntry.tableType + "::" + sheetDataEntry.columnName
                    if (!alreadyExpandedSelfs.includes(selfKey)) {
                        //prevent infinite recursion by only allowing to nest [self] references once
                        alreadyExpandedSelfs.push(selfKey)

                        addMetaForReferencedTable(thisSheetDataDetails, sheetDataEntry, sheetDataEntry.tableType)
                    }
                }

                addMetaForReferencedTable(thisSheetDataDetails, sheetDataEntry, sheetDataEntry.referenceToTableType)
                if (!simulateOnly) {
                    sheetDataEntry.searchPriority = ""
                } sheetDataEntriesToZeroSearchPriority.push(sheetDataEntry)
            }
        }

        for (const entry of sheetDataEntriesToZeroSearchPriority) {
            if (!simulateOnly) entry.searchPriority = ""
        }
    }

    function addMetaForReferencedTable(thisSheetDataDetails, sheetDataEntry, requiredTableType) {
        for (const referencedMeta of thisSheetDataDetails.filter((item) => item.tableType == requiredTableType)) {

            let searchPriority = 0
            //console.log(sheetDataEntry.searchPriority)
            if (sheetDataEntry.searchPriority &&
                sheetDataEntry.searchPriority !== "" &&
                sheetDataEntry.searchPriority !== 0 &&
                referencedMeta.searchPriority &&
                referencedMeta.searchPriority !== "" &&
                referencedMeta.searchPriority !== 0) {
                searchPriority = sheetDataEntry.searchPriority - 1 + referencedMeta.searchPriority
            }

            if (!simulateOnly) {
                thisSheetDataDetails.push(createSkeletonMeta(
                    {
                        table: sheetDataEntry.tableType,
                        columnName: sheetDataEntry.columnName + "#." + referencedMeta.columnName,
                        title: referencedMeta.title,
                        type: referencedMeta.type,
                        referenceToTableType: referencedMeta,
                        searchPriority: searchPriority
                    }))
            }
        }
    }

    function createSkeletonMeta(options) {
        const {
            table = "",
            columnName = "",
            title = "",
            type = "",
            referenceToTableType = "",
            searchPriority = 0
        } = options || {}
        let meta = { tableType: table, columnName: columnName, title: title, type: type, referenceToTableType: referenceToTableType, searchPriority: searchPriority }
        return meta
    }

    function linkReference(entry, path, targetTableData, targetTableType, simulateOnly, accumulator) {
        if (accumulator === undefined) {
            accumulator = ""
        }

        for (var property in entry) {
            var value = entry[property]

            if (path === accumulator + property) {
                //index keeps track of the current array item we are referencing as ref-list are arrays
                let index = 0
                for (const id of value) {
                    //only link to string IDs, prevents messing with already linked objects
                    if (typeof id === 'string' || id instanceof String) {
                        let linkedData = targetTableData.find((item) => item.id == id)
                        if (linkedData === undefined) {
                            //TODO enable logfn
                            logFn && logFn("error", "Failed to find " + id + " (in path '" + path + "') in " + targetTableType)
                        }
                        if (!simulateOnly) {
                            entry[property][index] = linkedData
                        }
                    }
                    index++
                }
            }
            else if (path.startsWith(accumulator + property + ".")) {
                if (typeof value === 'object') {
                    linkReference(value, path, targetTableData, targetTableType, simulateOnly, accumulator + property + ".")
                }

                if (Array.isArray(value)) {
                    for (const element of value) {
                        linkReference(element, path, targetTableData, targetTableType, simulateOnly, accumulator + property + ".")
                    }
                }
            }
        }
    }

    return data
}