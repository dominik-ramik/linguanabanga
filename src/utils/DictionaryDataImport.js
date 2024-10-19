import { i18n, _tf } from "@/utils/__deprecated__I18n.js"
import * as XLSX from "xlsx"
import getFilesRecursively from "@/utils/GetFilesRecursively.js"
import readText from "@/utils/ReadText.js"
import trimChar from "@/utils/TrimChar.js"
import { cssColorNames } from "@/utils/CssColors.js"
import { isArrayOfEmptyStrings } from "@/utils/IsArrayOfEmptyStrings.js"
import { indexOfCaseInsensitive } from "@/utils/Utils.js"
import { isValidHttpUrl } from "@/utils/IsValidHttpUrl.js"
import { pad } from "@/utils/Pad.js"
import { unpackReferences } from "@/composables/useDictionary.js"
import traverseData from "@/utils/traverseData.js"
import getMainItem from "./getMainItem.js"
import { extractShortcodes } from "./shortcodesProcessor.js"
import { audioFilesExtensions, imageFilesExtensions } from "./fileExtensions.js"

export let DictionaryDataImport = function () {
    const dataStructure = dictionaryDataStructure
    let textFiles = []
    let otherFiles = []

    let preloadableAssets = []

    function compileDictionary() {
        console.log("Compiling")

        let currentDate = new Date()
        let currentDateString = currentDate.getFullYear() + "-" + pad((currentDate.getMonth() + 1).toString(), 2, "0") + "-" + pad(currentDate.getDate().toString(), 2, "0") + " " + currentDate.getHours().toString() + ":" + pad(currentDate.getMinutes().toString(), 2, "0")

        let dictionary = {
            general: {
                defaultLanguageVersion: dataStructure.common.languages.defaultLanguageCode,
                lastUpdate: currentDateString,
                supportedLanguages: dataStructure.common.languages.supportedLanguages,
                preloadableAssets: [],
            },
            versions: {},
        }

        dataStructure.common.languages.supportedLanguages.forEach(lang => {
            dictionary.versions[lang.code] = compileLanguageVersion(lang.code)
        })

        console.log("--- Compiled data")

        //do a test run unpacking references to see if all references exist
        let unpackedDictionary = JSON.parse(JSON.stringify(dictionary))
        unpackReferences(unpackedDictionary, log, false)

        //this has to be called after the dictionary has been unpacked so that all the data are expanded
        dictionary.general.preloadableAssets = getPreloadableAssetsProjects(unpackedDictionary, preloadableAssets)

        dictionaryDataImport.compiledData = dictionary

        console.log(dictionary)

        return dictionary

        function getPreloadableAssetsProjects(unpackedDictionary, assets) {

            let extractedPaths = {}
            const pathsRegex = /"\/data\/[^"]+\.[a-zA-Z0-9]{1,5}"/g

            for (const lang of dataStructure.common.languages.supportedLanguages) {
                extractedPaths[lang.code] = unpackedDictionary.versions[lang.code].tables
                    .filter(table => table.meta.project && table.meta.project != "")
                    .map(table => ({ project: table.meta.project, data: JSON.stringify(table.data).match(pathsRegex) }))
            }

            let unusedAssets = []
            let usedAssets = []

            assets.forEach((asset) => {
                let refs = {}
                for (const lang of dataStructure.common.languages.supportedLanguages) {

                    let projects = []

                    let existingProjectTags = Object.keys(unpackedDictionary.versions[lang.code].projectsMeta)

                    for (const projectTag of existingProjectTags) {
                        if (asset.tableName.includes(projectTag) && !projects.includes(projectTag)) {
                            projects.push(projectTag)
                        }
                    }

                    //TODO eduplicate
                    projects = [...projects, ...extractedPaths[lang.code]
                        .filter(item => item.data?.includes("\"" + asset.path + "\""))
                        .map(item => item.project)
                    ]

                    if (projects.length > 0) {
                        refs[lang.code] = projects
                    } else {
                        unusedAssets.push({ lang: lang.code, path: asset.path })
                    }
                }

                if (Object.keys(refs).length > 0) {
                    usedAssets.push({ path: asset.path, size: asset.size, refs: refs })
                }
            })

            if (unusedAssets.length > 0) {
                console.log("Unused assets", unusedAssets)
            }

            return usedAssets
        }

        function compileLanguageVersion(langCode) {
            let version = {
                portalMeta: {},
                projectsMeta: {},
                tempTables: {}, //temporary structure for convenience, later transformed into an array of objects
            }

            let projects = dataStructure.sheets.config.tables.languageProjects.data[langCode]
            let projectTags = projects.map((project) => project.projectTag)

            version.portalMeta.about = tryLoadingExternalFile(dataStructure.sheets.config.tables.customization.getItem("About section", langCode, ""), "", langCode)
            version.portalMeta.dateFormat = dataStructure.sheets.config.tables.customization.getItem("Date format", langCode, "")
            version.portalMeta.name = dataStructure.sheets.config.tables.customization.getItem("Portal name", langCode, "Dictionary")
            version.portalMeta.sheetDataDetails = dataStructure.common.getAllColumnInfos(langCode)
            version.portalMeta.layouts = dataStructure.sheets.config.tables.layouts.data[langCode]
            version.portalMeta.menu = dataStructure.sheets.config.tables.menuItems.data[langCode]

            projects.forEach((project) => {
                let supportedVersionTranslations = project.translations.split(",").map((item) => item.trim())
                if (supportedVersionTranslations.indexOf(langCode) >= 0) {
                    version.projectsMeta[project.projectTag] = {
                        projectName: project.projectName,
                        projectTag: project.projectTag,
                        isoCode: project.isoCode,
                        menuPath: project.menuPath,
                        translations: supportedVersionTranslations,
                        languageName: project.languageName,
                        specialLetters: project.specialLetters,
                    }
                }
            })

            for (const sheetName in dataStructure.sheets) {
                let sheet = dataStructure.sheets[sheetName]
                if (sheet.type == "meta") {
                    continue
                }

                let projectsInSheet = dataStructure.sheets[sheetName].data[langCode]
                    .map((row) => row.d.project)
                    .filter(
                        (value, index, current_value) => current_value.indexOf(value) === index
                    );

                let sheetHasProjects = false
                if (projectsInSheet.length == 1 && projectsInSheet[0] === undefined) {
                    sheetHasProjects = false
                }
                else if (projectsInSheet.length > 1 && projectsInSheet.indexOf(undefined) >= 0) {
                    console.error("Cannot have empty entries in 'projects' column in sheet" + sheetName)
                }
                else {
                    sheetHasProjects = true
                }

                let tableIds = {} //table IDs for different projects, "[none]" for entries without project column
                if (sheetHasProjects) {
                    for (const project of projectsInSheet) {
                        let id = sheetName + "-" + project
                        tableIds[project] = id
                        createBlankTableInVersion(version, id, { tableType: sheetName, project: project })
                    }
                }
                else {
                    if (projectTags.includes(sheetName)) {
                        let id = "dictionary-" + sheetName
                        tableIds[sheetName] = id
                        createBlankTableInVersion(version, id, { tableType: "dictionary", project: sheetName })
                    }
                    else {
                        let id = sheetName
                        tableIds["[none]"] = id
                        createBlankTableInVersion(version, id, { tableType: sheetName })
                    }
                }

                dataStructure.sheets[sheetName].data[langCode].forEach((row) => {
                    let project = row.d.project

                    if (project) {
                        version.tempTables[tableIds[project]].data.push(row.d)
                    }
                    else {
                        if (projectTags.includes(sheetName)) {
                            version.tempTables[tableIds[sheetName]].data.push(row.d)
                        }
                        else {
                            version.tempTables[tableIds["[none]"]].data.push(row.d)
                        }
                    }
                })
            }

            version.tables = Object.keys(version.tempTables).map((tableKey) => {
                version.tempTables[tableKey].meta.tableName = tableKey


                return { meta: version.tempTables[tableKey].meta, data: version.tempTables[tableKey].data }
            })

            delete version.tempTables

            /* holds shortcodes by language code { en: [{table: A, id: B}, {table: C, id: D}] }
            index in each of the language code arrays corresponds to the two Unicode characters
            from Supplement­ary Special-purpose Plane prepended to the processed text plus E0002
            (E0000 and E0001 are opening and closing tag around processed text)
            Eg.
            Original text: See also notes on specimen {{specimens/dmr1}}
            Processed text: See also notes on specimen \uE0000\uE0000\uE0005Harpulia\uE0001 (Harpulia would be the MAIN item under the ID)
            shortcodes entry on index 3 in the array: { table: specimens, id: dmr1 } 
            
            see shortcodesProcessor.js for details
            */
            version.portalMeta.shortcodes = []

            Object.keys(version.tables).map((tableKey) => {
                //Process shortcodes in all data in this table
                for (const entry of version.tables[tableKey].data) {
                    traverseData(entry, {
                        modifier: function (data) {
                            return extractShortcodes(data,
                                version.portalMeta.shortcodes,
                                version.tables[tableKey].meta.tableType,
                                function (tableType, id, originalMatch) {
                                    if (!tableType) {
                                        tableType = version.tables[tableKey].meta.tableType
                                    }
                                    let referencedItem = undefined
                                    for (const table of version.tables.filter((table) => table.meta.tableType == tableType)) {
                                        referencedItem = table.data.find((entry) => entry.id == id)
                                        if (referencedItem !== undefined) {
                                            break
                                        }
                                    }

                                    if (referencedItem === undefined) {
                                        log("error", "Could not find id '" + id + "' on table type '" + tableType + "' referenced in shortcode in '" + data + "' in table " + version.tables[tableKey].meta.tableName)
                                    }
                                    else {
                                        let mainItem = getMainItem(version.portalMeta.sheetDataDetails, tableType, referencedItem)
                                        if (mainItem === undefined) {
                                            log("error", "Could not find main item for '" + id + "' on table type '" + tableType + "' referenced in shortcode in '" + data + "' in table " + version.tables[tableKey].meta.tableName)
                                        }
                                        else {
                                            return mainItem
                                        }
                                    }
                                    return originalMatch
                                })
                        }
                    })
                }
            })

            function createBlankTableInVersion(version, tableId, meta) {
                version.tempTables[tableId] = {
                    meta: meta,
                    data: []
                }
            }

            return version
        }
    }

    function extractFileLinksFromMarkdown(markdownText) {
        const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
        const fileExtensions = [...audioFilesExtensions, ...imageFilesExtensions];

        const fileLinks = [];

        let match;
        while ((match = linkRegex.exec(markdownText)) !== null) {
            const linkUrl = match[1];
            const linkUrlLowerCase = match[1].toLowerCase();

            // Check if the link URL ends with a valid file extension
            const isFileLink = fileExtensions.some(ext => linkUrlLowerCase.endsWith(ext));
            if (isFileLink && linkUrlLowerCase.startsWith("/data/")) {
                fileLinks.push(linkUrl);
            }
        }

        return fileLinks;
    }

    function tryLoadingExternalFile(value, referencedInProject, langCode) {
        if (value.startsWith("F:")) {
            value = value.substring(2)
            let foundFile = textFiles.find((file) => file.name.endsWith(value))
            if (foundFile === undefined) {
                //TODO put this into LOG
                throw new Error("Linked file not found: " + value)
            }
            else {
                value = foundFile.content

                for (const linkedFile of extractFileLinksFromMarkdown(value)) {
                    addPreloadableFile(linkedFile, referencedInProject, langCode)
                }
            }
        }

        return value
    }

    function addPreloadableFile(path, referencedInProject, lang) {
        let foundAssetIndex = preloadableAssets.findIndex((asset) => asset.path == path)
        if (foundAssetIndex < 0) {
            let size = 0
            let foundFile = otherFiles.find((file) => file.name == path || "/" + file.name == path)
            if (foundFile) {
                size = foundFile.size
            }
            else {
                console.log("Missing file", path) //TODO put this to log
            }

            preloadableAssets.push({ path: path, size: size, tableName: [], lang: [] })
            foundAssetIndex = preloadableAssets.length - 1
        }
        preloadableAssets[foundAssetIndex].tableName.includes(referencedInProject) || preloadableAssets[foundAssetIndex].tableName.push(referencedInProject)
        preloadableAssets[foundAssetIndex].lang.includes(lang) || preloadableAssets[foundAssetIndex].lang.push(lang)
    }

    function loadSheetData(tableName, table, sheetType) {

        let allColumnInfos = dataStructure.common.getAllColumnInfos(dataStructure.common.languages.defaultLanguageCode)
        allColumnInfos = allColumnInfos.filter((item) => item.tableType == sheetType)

        if (allColumnInfos.find((info) => info.tableType == sheetType && info.type.toLowerCase() == "id") == undefined) allColumnInfos.push({ tableType: sheetType, columnName: "id", type: "id" })
        if (allColumnInfos.find((info) => info.tableType == sheetType && info.type.toLowerCase() == "project") == undefined) allColumnInfos.push({ tableType: sheetType, columnName: "project", type: "project" })
        //if (allColumnInfos.find((info) => info.tableType == sheetType && info.type.toLowerCase() == "draft") == undefined) allColumnInfos.push({ tableType: sheetType, columnName: "draft", type: "draft" })
        //if (allColumnInfos.find((info) => info.tableType == sheetType && info.type.toLowerCase() == "privacy") == undefined) allColumnInfos.push({ tableType: sheetType, columnName: "privacy", type: "privacy" })
        if (allColumnInfos.find((info) => info.tableType == sheetType && info.type.toLowerCase() == "indexlevel") == undefined) allColumnInfos.push({ tableType: sheetType, columnName: "indexlevel", type: "" })
        if (allColumnInfos.find((info) => info.tableType == sheetType && info.type.toLowerCase() == "indexlevel#") == undefined) allColumnInfos.push({ tableType: sheetType, columnName: "indexlevel#", type: "tree-items" })

        //console.log("INFOS", allColumnInfos)
        let allColumnNames = allColumnInfos.map(function (item) { return item.columnName })

        dataStructure.sheets[tableName] = {}

        dataStructure.sheets[tableName].data = {}
        dataStructure.common.allUsedDataPaths = {}
        dataStructure.common.languages.supportedLanguages.forEach(function (lang) {
            dataStructure.sheets[tableName].data[lang.code] = []
            dataStructure.common.allUsedDataPaths[lang.code] = []

            let headers = table[0].map(function (item) { return item.toLowerCase() })
            //check duplicates in headers
            let headersCache = []
            headers.forEach(function (header) {
                if (header.trim() == "") {
                    return
                }
                if (headersCache.indexOf(header) < 0) {
                    headersCache.push(header)
                } else {
                    log("error", _tf("dm_column_names_duplicate", [header]))
                }
            })

            for (let rowIndex = 1; rowIndex < table.length; rowIndex++) {
                const row = table[rowIndex]

                let rowObj = { t: [], d: {} }

                let draftColumnIndex = headers.findIndex((head) => head == "draft" || head == "draft:" + lang.code)
                if (draftColumnIndex >= 0) {
                    //skip draft rows
                    if (row[draftColumnIndex] !== undefined && row[draftColumnIndex] != null && row[draftColumnIndex] != "") {
                        log("info", _tf("skipped_draft", [lang.code]))
                        continue;
                    }
                }

                allColumnInfos.forEach(function (info) {

                    let position = dataPath.analyse.position(allColumnNames, info.columnName)
                    if (!position.isLeaf) {
                        return
                    }

                    includeTreefiedData(rowObj.d, headers, row, dataPath.modify.pathToSegments(info.columnName), 0, info, "", lang.code, tableName)
                })

                rowObj.d = cleanupObject(rowObj.d)

                dataStructure.sheets[tableName].data[lang.code].push(rowObj)
            }
        })

        function cleanupObject(obj) {
            function isEmpty(obj) {
                if (obj === null || obj === undefined) {
                    return true
                }
                if (Array.isArray(obj) && obj.length == 0) {
                    return true
                }
                else if (typeof obj === 'object' && Object.keys(obj).length == 0) {
                    return true
                }
                else if ((typeof obj === 'string' || obj instanceof String) && obj.trim() == "") {
                    return true
                }
                return false
            }

            if (Array.isArray(obj)) {
                let cleanedArray = []
                for (const item of obj) {
                    let cleanItem = cleanupObject(item)
                    if (!isEmpty(cleanItem)) {
                        cleanedArray.push(cleanItem)
                    }
                }
                return cleanedArray
            }
            else if (typeof obj === 'object') {
                if (!isEmpty(obj)) {
                    let cleanedObject = {}
                    for (let index = 0; index < Object.keys(obj).length; index++) {
                        const key = Object.keys(obj)[index]
                        const val = cleanupObject(obj[key])

                        if (!isEmpty(val)) {
                            cleanedObject[key] = val
                        }
                    }

                    return cleanedObject
                }
            }
            else if ((typeof obj === 'string' || obj instanceof String) && obj.trim() != "") {
                return obj
            }
            else {
                return obj
            }
        }

        function includeTreefiedData(rowObjData, headers, row, pathSegments, pathPosition, info, computedPath, langCode, tableName) {
            const currentSegment = pathSegments[pathPosition]

            if (currentSegment == "#") {
                let count = 0
                let possible = []

                do {
                    count++
                    let countedComputedPath = computedPath + count
                    possible = headers.filter(function (header) {
                        let headerWithoutLanguageCode = header.split(":")[0]
                        if (headerWithoutLanguageCode == countedComputedPath || headerWithoutLanguageCode.startsWith(countedComputedPath + ".")) {
                            return true
                        }
                    })
                    if (possible.length > 0) {

                        if (dataStructure.common.allUsedDataPaths[langCode].indexOf(countedComputedPath) < 0) {
                            dataStructure.common.allUsedDataPaths[langCode].push(countedComputedPath)
                        }

                        if (pathPosition == pathSegments.length - 1) {
                            //terminal node
                            if (Object.hasOwn(rowObjData, currentSegment)) {
                                throw _tf("dm_duplicate_segment", [currentSegment])
                            }
                            let genericData = getGenericData(headers, row, countedComputedPath, info, langCode, tableName)
                            if (genericData !== "") {
                                rowObjData[count - 1] = genericData
                            }
                        } else {
                            if (rowObjData.length < count) {
                                rowObjData.push({})
                            }
                            includeTreefiedData(rowObjData[count - 1], headers, row, pathSegments, pathPosition + 1, info, countedComputedPath, langCode, tableName)
                        }
                    }
                }
                while (possible.length > 0)

            } else {
                computedPath = computedPath + (computedPath == "" ? "" : ".") + currentSegment

                if (dataStructure.common.allUsedDataPaths[langCode].indexOf(computedPath) < 0) {
                    dataStructure.common.allUsedDataPaths[langCode].push(computedPath)
                }

                if (pathPosition == pathSegments.length - 1) {
                    //terminal node
                    if (Object.hasOwn(rowObjData, currentSegment)) {
                        console.log("ERROR duplicity for: " + currentSegment)
                    }
                    let genericData = getGenericData(headers, row, computedPath, info, langCode, tableName)
                    if (genericData) {
                        rowObjData[currentSegment] = genericData
                    }
                    return
                } else {
                    if (!Object.hasOwn(rowObjData, currentSegment)) {
                        if (pathSegments[pathPosition + 1] == "#") {
                            rowObjData[currentSegment] = []
                        } else {
                            rowObjData[currentSegment] = {}
                        }
                    }
                }
                includeTreefiedData(rowObjData[currentSegment], headers, row, pathSegments, pathPosition + 1, info, computedPath, langCode, tableName)
            }
        }

        function getGenericData(headers, row, computedPath, info, langCode, tableName) {

            let stringValue = readSimpleData(headers, row, computedPath, langCode)

            let referencedInProject = tableName
            let projectIndex = headers.indexOf("project")
            if (projectIndex > 0 && row[projectIndex].length > 0) {
                referencedInProject = row[projectIndex]
            }

            switch (info.type) {
                case "id":
                    if (stringValue == null) {
                        throw "ID cannot be empty in " + info.tableType + " column " + info.columnName
                    }
                    if (stringValue.toString().length > 0) {
                        //stringValue = VueDOMPurifyHTML.sanitize(stringValue)

                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")

                        return stringValue
                    }
                    break
                case "text":
                    if (stringValue == null) {

                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        //stringValue = VueDOMPurifyHTML.sanitize(stringValue)

                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")

                        stringValue = tryLoadingExternalFile(stringValue, referencedInProject, langCode)

                        return stringValue
                    }
                    break
                case "markdown":
                    if (stringValue == null) {

                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        //stringValue = VueDOMPurifyHTML.sanitize(stringValue)

                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")

                        stringValue = tryLoadingExternalFile(stringValue, referencedInProject, langCode)

                        return stringValue
                    }
                    break
                case "main":
                    if (stringValue == null) {

                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        //stringValue = VueDOMPurifyHTML.sanitize(stringValue)

                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")

                        stringValue = tryLoadingExternalFile(stringValue, referencedInProject, langCode)

                        return stringValue
                    }
                    break
                case "audio":
                    if (stringValue == null) {

                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        //stringValue = VueDOMPurifyHTML.sanitize(stringValue)

                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")

                        return stringValue
                    }
                    break
                case "image":
                    if (stringValue == null) {

                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        //stringValue = VueDOMPurifyHTML.sanitize(stringValue)

                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")

                        return stringValue
                    }
                    break
                case "privacy":
                    if (stringValue == null) {

                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        //stringValue = VueDOMPurifyHTML.sanitize(stringValue)

                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")

                        return stringValue
                    }
                    break
                case "draft":
                    if (stringValue == null) {

                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        //stringValue = VueDOMPurifyHTML.sanitize(stringValue)

                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")

                        return stringValue
                    }
                    break
                case "project":
                    if (stringValue == null) {

                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        //stringValue = VueDOMPurifyHTML.sanitize(stringValue)

                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")

                        return stringValue
                    }
                    break
                case "ref-list":
                    if (stringValue == null) {
                        return []
                    }
                    if (stringValue.toString().length > 0) {
                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")
                        return stringValue.split(",").map((element) => element.trim())
                    }
                    break
                case "tree-items":
                    // TODO console.log("todo make sure this is an array of strings")
                    if (stringValue == null) {
                        return []
                    }
                    if (stringValue.toString().length > 0) {
                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")
                        return stringValue.trim()
                    }
                    break
                case "file-audio":
                    if (stringValue == null) {
                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")
                        let fileName = stringValue.trim()
                        fileName = trimChar(fileName, "/")

                        if (dataStructure.sheets.config.tables.languageProjects.data[langCode].find((project) => project.projectTag == tableName)) {
                            fileName = "/data/rec/" + tableName + "/" + fileName
                        }
                        else {
                            fileName = "/data/rec/" + fileName
                        }

                        addPreloadableFile(fileName, referencedInProject, langCode)
                        return fileName
                    }
                    break
                case "file-image":
                    if (stringValue == null) {
                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")
                        let fileName = stringValue.trim()
                        fileName = trimChar(fileName, "/")

                        fileName = "/data/img/" + tableName + "/" + fileName

                        addPreloadableFile(fileName, referencedInProject, langCode)

                        return fileName
                    }
                    break
                case "file-image-absolute":
                    if (stringValue == null) {
                        return ""
                    }
                    if (stringValue.toString().length > 0) {
                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")
                        let fileName = stringValue.trim()
                        fileName = trimChar(fileName, "/")
                        fileName = "/data/img/" + fileName

                        addPreloadableFile(fileName, referencedInProject, langCode)

                        return fileName
                    }
                    break
                case "folder-images":
                    // TODO console.log("implement final path interpolation here")
                    if (stringValue == null) {
                        return []
                    }
                    if (stringValue.toString().length > 0) {
                        stringValue = stringValue.toString().trim()
                        stringValue = stringValue.replace(/\r\n/, "\\n")
                        stringValue = stringValue.replace(/[\r\n]/, "\\n")
                        let folderOrFileName = stringValue.trim()
                        folderOrFileName = trimChar(folderOrFileName, "/")
                        folderOrFileName = "/data/img/" + folderOrFileName

                        let folderFiles = []
                        if (folderOrFileName == "") {
                            return folderFiles
                        }

                        let lastSlash = folderOrFileName.lastIndexOf("/")
                        let lastSegment = folderOrFileName
                        if (lastSlash >= 0) {
                            lastSegment = folderOrFileName.substring(lastSlash + 1)
                        }

                        if (lastSegment.lastIndexOf(".") > 0) {
                            let extension = lastSegment.substring(lastSegment.lastIndexOf(".")).toLowerCase()
                            //single file
                            if (imageFilesExtensions.includes(extension)) {
                                folderFiles = [folderOrFileName]
                                addPreloadableFile(folderOrFileName, referencedInProject, langCode)
                            }
                        }
                        else {
                            //folder
                            let possibleFiles = otherFiles.filter((file) => file.name.startsWith(folderOrFileName + "/")).map((file) => file.name)

                            if (possibleFiles.length == 0) {
                                console.error("Empty image folder:", folderOrFileName)
                            }

                            for (const file of possibleFiles) {
                                let extension = file.substring(file.lastIndexOf(".")).toLowerCase()
                                if (imageFilesExtensions.includes(extension)) {
                                    folderFiles.push(file)
                                    addPreloadableFile(file, referencedInProject, langCode)
                                }
                            }

                        }

                        return folderFiles
                    }
                    break
                default:
                    console.log("Unknown data type: " + info.type)
                    break
            }
            return ""
        }

        function readSimpleData(headers, row, columnName, language) {
            //try with given language
            let colIndex = indexOfCaseInsensitive(headers, columnName + ":" + language)
            //try with default language code
            if (colIndex < 0) {
                colIndex = indexOfCaseInsensitive(headers, columnName + ":" + dataStructure.common.languages.defaultLanguageCode)
            }
            //try without default language code
            if (colIndex < 0) {
                colIndex = indexOfCaseInsensitive(headers, columnName)
            }
            if (colIndex < 0) {
                return null
            }
            return row[colIndex]
        }
    }

    function checkMetaValidity() {
        // automatic check based on integrity data
        Object.keys(dataStructure.sheets).forEach(function (sheetKey) {
            let sheet = dataStructure.sheets[sheetKey]
            if (sheet.type == "meta") {
                Object.keys(sheet.tables).forEach(function (tableKey) {
                    let table = sheet.tables[tableKey]
                    dataStructure.common.languages.supportedLanguages.forEach(function (lang) {
                        let tableData = table.data[lang.code]
                        tableData.forEach(function (dataRow) {
                            Object.keys(table.columns).forEach(function (columnKey) {
                                let entireColumn = tableData.map(function (row) {
                                    return row[columnKey]
                                })
                                let column = table.columns[columnKey]
                                let integrity = column.integrity
                                let value = dataRow[columnKey]

                                if (!integrity.allowEmpty && (value === undefined || value.trim() == "")) {
                                    log("error", _tf("dm_value_cannot_be_empty", [column.name, table.name]))
                                }

                                switch (integrity.allowedContent) {
                                    case "any":
                                        // no check to do
                                        break
                                    case "list": {
                                        let found = false
                                        let valueLC = value.toLowerCase()
                                        integrity.listItems.forEach(function (allowed) {
                                            let allowedLC = allowed.toLowerCase()

                                            if (!found && allowedLC == valueLC) {
                                                found = true
                                            }
                                            if (!found && allowedLC.endsWith("*") && valueLC.startsWith(allowedLC.substring(0, allowedLC.length - 1))) {
                                                found = true
                                            }
                                        })
                                        if (!found) {
                                            log("error", _tf("dm_incorrect_list", [value, column.name, table.name, integrity.listItems.map(function (item) { return item == "" ? "(space)" : "'" + item + "'" }).join(", ")]))
                                        }
                                    }
                                        break
                                    case "columnName":
                                        if (!dataPath.validate.isSimpleColumnName(value)) {
                                            log("error", _tf("dm_incorrect_simple_column_name", [value, column.name, table.name]))
                                        }
                                        break
                                    case "cssColor":
                                        {
                                            //let hexHslaRgbaColor = new RegExp("(#([0-9a-f]{3}){1,2}|(rgba|hsla)\(\d{1,3}%?(,\s?\d{1,3}%?){2},\s?(1|0|0?\.\d+)\)|(rgb|hsl)\(\d{1,3}%?(,\s?\d{1,3}%?){2}\))", "i")
                                            let hexHslaRgbaColor = new RegExp("(#([0-9a-f]{3}){1,2}|(rgba|hsla)(d{1,3}%?(,s?d{1,3}%?){2},s?(1|0|0?.d+))|(rgb|hsl)(d{1,3}%?(,s?d{1,3}%?){2}))", "i")
                                            if (hexHslaRgbaColor.test(value) == false && cssColorNames.indexOf(value.toLowerCase()) < 0) {
                                                log("error", _tf("dm_incorrect_hlsa", [value, column.name, table.name]))
                                            }
                                        }
                                        break
                                    case "filename": {
                                        let ext = ""
                                        if (value.indexOf(".") > 0) {
                                            ext = value.substring(value.indexOf("."))
                                        }
                                        if (integrity.allowedExtensions.indexOf(ext.toLowerCase()) < 0) {
                                            log("error", _tf("dm_incorrect_filename", [value, column.name, table.name, integrity.allowedExtensions.join(", ") + ")"]))
                                        }
                                    }
                                        break
                                    case "url":
                                        if (!isValidHttpUrl(value)) {
                                            log("error", _tf("dm_incorrect_http", [value, column.name, table.name]))
                                        }
                                        break
                                    case "dataPath":
                                        if (!dataPath.validate.isDataPath(value)) {
                                            log("error", _tf("dm_incorrect_datapath", [value, column.name, table.name]))
                                        }
                                        break
                                    default:
                                        console.log("Unknown integrity allowed content: " + integrity.allowedContent)
                                        break
                                }

                                if (integrity.allowDuplicates !== "yes") {
                                    let count = 0
                                    entireColumn.forEach(function (item) {
                                        //console.log(item)
                                        if (item.toString().toLowerCase() == value.toString().toLowerCase()) {
                                            if (value == "") {
                                                if (integrity.allowDuplicates != "empty-only") {
                                                    count++
                                                }
                                            } else {
                                                count++
                                            }
                                        }
                                    })
                                    if (count > 1) {
                                        log("error", _tf("dm_incorrect_must_be_unique", [value, column.name, table.name]))
                                    }
                                }
                            })
                        })
                    })


                })
            }
        })

        //
        // Manual checks of logic
        //

        // Ensure all languages are displayable and proper fallback language is provided if translation is missing
        dataStructure.common.languages.supportedLanguages.forEach(function (lang) {
            if (i18n.getSupportedLanguageCodes().indexOf(lang.code) < 0 && i18n.getSupportedLanguageCodes().indexOf(lang.fallbackLanguage) < 0) {
                log("warning", _tf("dm_specify_fallback_language", [lang.name, "Supported languages", dataStructure.sheets.appearance.name, i18n.getSupportedLanguageCodes().join(", ")]))
            }
        })

        // All table type + column name through all tables should be unique
        let uniqueColumnNames = {}
        dataStructure.common.getAllColumnInfos(dataStructure.common.languages.defaultLanguageCode).forEach(function (item) {
            const tableTypeColumnName = item.tableType.toLowerCase() + "-" + item.columnName.toLowerCase()
            if (Object.keys(uniqueColumnNames).indexOf(tableTypeColumnName) < 0) {
                uniqueColumnNames[tableTypeColumnName] = item
            } else {
                console.log("Column name duplicate", item.columnName, item.tableType, uniqueColumnNames[item.columnName])
                log("error", _tf("dm_column_name_duplicate", [item.columnName, item.tableType, uniqueColumnNames[item.columnName]]))
            }
        })

        // Hue has to be 0-360
        /*
        data.common.languages.supportedLanguages.forEach(function (lang) {
            let hueRow = data.sheets.config.tables.customization.data[lang.code].find(function (row) {
                if (row.item == "Color theme hue") {
                    return true
                }
            })
            let hueString = (hueRow ? hueRow.value : NaN)
     
            let hue = parseInt(hueString)
            if (isNaN(hue) || hue < 0 || hue > 360) {
                log("error", _tf("dm_hue_value", [data.sheets.config.tables.customization.name]))
            }
        })
        */

        /*
        data.common.languages.supportedLanguages.forEach(function (lang) {
            let table = data.sheets.config.tables.layouts.data[lang.code]
            let allColumnNames = table.map(function (row) { return row.columnName.toLowerCase() })
     
            table.forEach(function (row) {
                //console.log(row)
                let columnName = row.columnName
                let colPosition = dataPath.analyse.position(allColumnNames, columnName.toLowerCase())
     
                // Only root column can have "placement"
                if (row.placement != "" && !(colPosition.isSimpleItem || colPosition.isRoot)) {
                    log("error", _tf("dm_wrong_placement", [columnName, row.placement, columnName.substring(0, columnName.indexOf("."))]))
                }
     
                // Only leaf column can have "template"
                if (row.template != "" && !colPosition.isLeaf) {
                    log("error", _tf("dm_wrong_template", [columnName]))
                }
     
                // Only leaf column can have badge "formatting"
                ///*
                if (row.formatting.toLowerCase() == "badge" && !colPosition.isLeaf) {
                    log("error", _tf("dm_wrong_badge", [columnName, data.sheets.content.tables.customDataDefinition.columns.formatting.name]))
                }
                ///* /
     
                // Only columns with children or # can have subitems separator
                if (row.subitemsSeparator != "" && !colPosition.hasChildren) {
                    log("error", _tf("dm_wrong_separator", [columnName, data.sheets.content.tables.customDataDefinition.columns.subitemsSeparator.name]))
                }
     
                ///*
                // Setting "allow empty values" on non-leaf means all leaves can be empty
                if (row.allowEmptyValues == "yes" && colPosition.hasChildren) {
                    let children = dataPath.analyse.getChildrenOf(allColumnNames, columnName)
                    table.forEach(function(row) {
                        if (children.indexOf(row.columnName.toLowerCase()) >= 0) {
                            row.allowEmptyValues = "yes"
                            //console.log("Added allowEmptyValues to "  + row.columnName)
                        }
                    })
                }
                //* /
     
                // Hidden cannot have any props (like title, template, ...)
                if (row.hidden == "yes") {
                    Object.keys(row).forEach(function (columnKey) {
                        if (columnKey != "columnName" && columnKey != "hidden" && row[columnKey].toString().trim() != "") {
                            if (columnKey == "searchCategoryTitle") {
                                //skip search title, as this is allowed
                                return
                            }
                            console.log(columnKey)
                            console.log(row[columnKey])
                            log("warning", _tf("dm_hidden_column_name", [columnName, data.sheets.content.tables.customDataDefinition.columns[columnKey].name]))
                            row[columnKey] = ""
                        }
                    })
                }
            })
        })
        */
    }

    function postprocessMetadata() {
        // set default values if needed
        //*
        Object.keys(dataStructure.sheets).forEach(function (sheetKey) {
            let sheet = dataStructure.sheets[sheetKey]
            if (sheet.type == "meta") {
                Object.keys(sheet.tables).forEach(function (tableKey) {
                    let table = sheet.tables[tableKey]
                    dataStructure.common.languages.supportedLanguages.forEach(function (lang) {
                        let tableData = table.data[lang.code]
                        tableData.forEach(function (dataRow) {
                            Object.keys(table.columns).forEach(function (columnKey) {
                                let column = table.columns[columnKey]
                                let integrity = column.integrity

                                let value = dataRow[columnKey]

                                if (tableKey == "customDataDefinition" && dataRow["hidden"] === true) {
                                    //skip hidden
                                    return
                                }

                                if (typeof value === "string" && value.trim() === "" && integrity.allowEmpty && integrity.defaultValue) {
                                    dataRow[columnKey] = integrity.defaultValue
                                }

                            })
                        })
                    })


                })
            }
        })
        //*/

        // make all column names and expressions inside {{ }} handlebars lowercase
        Object.keys(dataStructure.sheets).forEach(function (sheetKey) {
            let sheet = dataStructure.sheets[sheetKey]
            if (sheet.type == "meta") {
                Object.keys(sheet.tables).forEach(function (tableKey) {
                    let table = sheet.tables[tableKey]
                    dataStructure.common.languages.supportedLanguages.forEach(function (lang) {
                        let tableData = table.data[lang.code]
                        tableData.forEach(function (dataRow) {
                            Object.keys(table.columns).forEach(function (columnKey) {
                                //let column = table.columns[columnKey]
                                //let integrity = column.integrity
                                let value = dataRow[columnKey]

                                if (columnKey == "columnName") {
                                    dataRow[columnKey] = dataRow[columnKey].toLowerCase()
                                }

                                if (typeof value === "string" && value.trim() != "") {
                                    dataRow[columnKey] = dataRow[columnKey].replace(/({{[^}}]*}})/g, function (m, p1) {
                                        return (p1) ? p1.toLowerCase() : m.toLowerCase()
                                    })
                                }
                            })
                        })
                    })


                })
            }
        })
        /*
                data.common.languages.supportedLanguages.forEach(function (lang) {
                    // verify that customDataDefinition column names present all data paths eg. without info.redlist missing between info and info.redlist.code
                    let allDataPaths = data.sheets.config.tables.layouts.data[lang.code].map(function (row) {
                        return dataPath.modify.itemNumbersToHash(row.columnName).toLowerCase()
                    })
                    data.sheets.config.tables.layouts.data[lang.code].forEach(function (row) {
                        let current = dataPath.modify.itemNumbersToHash(row.columnName).toLowerCase()
        
                        if (!dataPath.validate.isDataPath(current)) {
                            // Skip invalid data paths not to introduce false suggestions on "you are missing ..."
                            return
                        }
        
                        let split = dataPath.modify.pathToSegments(current)
        
                        for (let index = 0 index < split.length index++) {
                            let cumulative = split.slice(0, index + 1).join(".").replaceAll(".#", "#")
        
                            if (allDataPaths.indexOf(cumulative) < 0) {
                                log("error", _tf("dm_hidden_missing_index", [cumulative, data.sheets.content.tables.customDataDefinition.name, data.sheets.content.tables.customDataDefinition.columns.columnName.name]))
                            }
                        }
                    })
                })
                */
    }

    function log(level, message) {
        //TODO enable log
        //return

        let index = dictionaryDataImport.loggedMessages.findIndex(function (msg) {
            if (msg.level == "critical" || msg.level == "error") {
                console.error("ERROR", message)
                dictionaryDataImport.hasErrors = true
            }

            if (msg.level + "-" + msg.message.toLowerCase() == level + "-" + message.toLowerCase()) {
                return true
            }
        })
        if (index < 0) {
            dictionaryDataImport.loggedMessages.push({ level: level, message: message })
        }

        if (level == "critical" || level == "error") {
            console.error("ERROR", message)

        }
    }

    let FilesystemOperations = {
        dataFolderDropHandler: async function (e, dataReadyCallback) {

            preloadableAssets = []
            textFiles = []
            otherFiles = []

            const fileHandlesPromises = [...e.dataTransfer.items]
                .filter((item) => item.kind === 'file')
                .map((item) => item.getAsFileSystemHandle())

            let files = []
            preloadableAssets = []

            //console.time("Parsing dropped files")

            for await (const handle of fileHandlesPromises) {
                if (handle.kind === 'directory') {
                    //console.log(`Directory: ${handle.name}`)
                    let path = [handle.name]
                    let contents = []

                    await getFilesRecursively(handle, contents, path)

                    contents.forEach((file) => {
                        file.path_components = file?.path_components?.join('/')
                    })

                    files.push(...contents)
                } else {
                    console.log(`File: ${handle.name}`)
                    let file = await handle.getFile()
                    file.path_components = file.name

                    files.push(file)
                }
            }

            files.forEach(async (item) => {
                let lowerCasePath = item.path_components.toLowerCase()
                if (lowerCasePath.endsWith('.txt') || lowerCasePath.endsWith('.md')) {
                    //console.log('xx')
                    let content = await readText(item)
                    textFiles.push({ name: "/" + trimChar(item.path_components, "/"), content: content })
                }
                else {
                    otherFiles.push({ name: "/" + trimChar(item.path_components, "/"), type: item.type, size: item.size })
                }
            })

            //console.timeEnd("Parsing dropped files")

            let breakLoop = false
            let foundSpreadsheet = false
            files.forEach(async (item) => {
                if (breakLoop)
                    return
                if (item.path_components.split('/')[1].endsWith('dictionary.xlsx')) {
                    foundSpreadsheet = true
                    let fileArrayBuffer = await item.arrayBuffer()

                    let extractor = new ExcelImport(fileArrayBuffer)

                    //console.time("Check metadata validity")                    
                    extractor.loadMeta(dataStructure, log)
                    checkMetaValidity()
                    //console.timeEnd("Check metadata validity")
                    //console.time("Postprocess metadata")
                    postprocessMetadata()
                    //console.timeEnd("Postprocess metadata")

                    let sheetsToLoad = []

                    extractor.workbookSheetNames().forEach((sheetName) => {
                        if (sheetName != "config") {
                            sheetsToLoad.push(sheetName)
                        }
                    })

                    //console.time("Sheets loading")
                    sheetsToLoad.forEach(function (dataSheetName) {
                        //console.time("- Loading sheet " + dataSheetName)
                        let sheetType = dataSheetName
                        dataStructure.sheets.config.tables.languageProjects.data[dataStructure.common.languages.defaultLanguageCode].forEach((project) => {
                            if (project.projectTag == dataSheetName) {
                                sheetType = "dictionary"
                            }
                        })

                        loadSheetData(dataSheetName, extractor.getRawSheetData(dataSheetName), sheetType)
                        //console.timeEnd("- Loading sheet " + dataSheetName)
                    })
                    //console.timeEnd("Sheets loading")

                    //console.time("Compile dictionary")
                    let dictionary = compileDictionary()
                    //console.timeEnd("Compile dictionary")
                    breakLoop = true
                    dictionaryDataImport.loadedData = dictionary
                    dataReadyCallback(dictionary)
                }
            })

            if (!foundSpreadsheet) {
                console.error("Could not find an XSLX spreadsheet whose name ends with 'dictionary' in the dropped folder.")
            }
        },

    }

    let dictionaryDataImport = {
        loggedMessages: [],
        hasErrors: false,

        loadedData: {},

        dataFolderDropHandler: async function (e, dataReadyCallback) {
            FilesystemOperations.dataFolderDropHandler(e, dataReadyCallback)
        },

        getCompiledDictionary() {
            return compileDictionary()
        },
    }

    return dictionaryDataImport
}

export let dataPath = {
    validate: {
        isSimpleColumnName: function (value) {
            let simpleColumnName = new RegExp("^[a-zA-Z]+$", "gi")
            return simpleColumnName.test(value)
        },
        isDataPath(value) {
            let valueSplit = value.split(".")
            let correct = true
            valueSplit.forEach(function (columnSegment) {
                if (!correct) {
                    return
                }
                let extendedColumnName = new RegExp("^[a-zA-Z]+(([1-9]+[0-9]*)|#)?$", "gi")
                if (extendedColumnName.test(columnSegment) == false) {
                    correct = false
                }
            })

            return correct
        }

    },
    analyse: {
        position: function (allDataPaths, thisDataPath) {
            let result = {
                isLeaf: false,
                isRoot: false,
                hasChildren: false,
                isSimpleItem: false,
            }

            allDataPaths = allDataPaths.map(function (item) { return dataPath.modify.itemNumbersToHash(item).toLowerCase() })
            thisDataPath = dataPath.modify.itemNumbersToHash(thisDataPath).toLowerCase()

            if (thisDataPath.indexOf(".") < 0 && thisDataPath.indexOf("#") < 0) {
                if (dataPath.analyse.hasChildren(allDataPaths, thisDataPath)) {
                    //root item
                    result.isLeaf = false
                    result.isRoot = true
                    result.hasChildren = true
                } else {
                    //simple item
                    result.isLeaf = true
                    result.isRoot = true
                    result.hasChildren = false
                }
            } else {
                if (dataPath.analyse.hasChildren(allDataPaths, thisDataPath)) {
                    //middle item
                    result.isLeaf = false
                    result.isRoot = false
                    result.hasChildren = true
                } else {
                    //leaf item
                    result.isLeaf = true
                    result.isRoot = false
                    result.hasChildren = false
                }
            }

            result.isSimpleItem = result.isLeaf && result.isRoot && !result.hasChildren
            return result
        },
        getChildrenOf(allDataPaths, parent) {
            parent = parent.toLowerCase()
            let children = []

            allDataPaths.forEach(function (othertDataPath) {
                let other = othertDataPath.toLowerCase()
                if (other.startsWith(parent + ".") || other.startsWith(parent + "#")) {
                    return children.push(other)
                }
            })

            return children
        },
        hasChildren: function (allDataPaths, possibleParent) {
            return dataPath.analyse.getChildrenOf(allDataPaths, possibleParent).length > 0
        }
    },
    modify: {
        itemNumbersToHash: function (value) {
            return value.replace(/(\d+)/g, "#")
        },
        pathToSegments: function (path) {
            let split = path.split(/\.|#/)
            split = split.map(function (item) {
                if (item == "") {
                    return "#"
                } else {
                    return item
                }
            })
            return split
        },
        segmentsToPath: function (segments) {
            let path = ""

            for (let index = 0; index < segments.length; index++) {
                const segment = segments[index]

                if (segment == "#") {
                    path = path + segment
                } else {
                    path = path + "." + segment
                }
            }

            if (path.startsWith(".")) {
                path = path.substring(1)
            }

            return path
        }
    }
}


let ExcelImport = function (excelFile) {

    function loadMetaStructure(workbook) {
        Object.keys(data.sheets).forEach(function (sheetKey) {
            let sheet = data.sheets[sheetKey]
            if (sheet.type == "meta") {
                Object.keys(sheet.tables).forEach(function (tableKey) {
                    let table = sheet.tables[tableKey]
                    table.data = {}
                    data.common.languages.supportedLanguages.forEach(function (lang) {
                        table.data[lang.code] = subTableToMultilingualObject(workbook, sheet.name, table, lang)
                    })
                })
            }
        })
    }

    function loadKnownLanguages(workbook) {
        let generalSheet = loadSheet(workbook, data.sheets.config.name)
        let languageTable = getSubTable(data.sheets.config.name, generalSheet, data.common.languages.languagesTableName)
        if (languageTable.length < 2) {
            throw "The '" + data.common.languages.languagesTableName + "' table needs to have at least one row, which contains the default language of the checklist"
        }

        let nCode = "Code"
        let nName = "Name of language"
        let nFallback = "Fallback language"

        let codeColumn = indexOfCaseInsensitive(languageTable[0], nCode)
        if (codeColumn < 0) {
            throw "Cannot find column 'Code' in the '" + data.common.languages.languagesTableName + "' table on sheet " + data.sheets.config.name
        }
        let nameColumn = indexOfCaseInsensitive(languageTable[0], nName)
        if (nameColumn < 0) {
            throw "Cannot find column 'Name of language' in the '" + data.common.languages.languagesTableName + "' table on sheet " + data.sheets.config.name
        }
        let fallbackColumn = indexOfCaseInsensitive(languageTable[0], nFallback)
        if (fallbackColumn < 0) {
            throw "Cannot find column 'Fallback language' in the '" + data.common.languages.languagesTableName + "' table on sheet " + data.sheets.config.name
        }

        data.common.languages.supportedLanguages = []

        for (let row = 1; row < languageTable.length; row++) {
            //const line = languageTable[row]
            let langCode = getCellFromSubTable(languageTable, row, nCode, "", data.common.languages.languagesTableName)
            let langName = getCellFromSubTable(languageTable, row, nName, "", data.common.languages.languagesTableName)
            let fallbackLang = getCellFromSubTable(languageTable, row, nFallback, "", data.common.languages.languagesTableName)

            /*
            //do not assig a fallback language, let's warn the user later on
            if (!fallbackLang || fallbackLang.toString().length == 0) {
                fallbackLang = ""
            }
            */

            if (langCode.trim() == "") {
                throw "Language code in the table '" + data.common.languages.languagesTableName + "' on line " + row + " cannot be empty"
            }
            if (langName.trim() == "") {
                throw "Language name in the table '" + data.common.languages.languagesTableName + "' on line " + row + " cannot be empty"
            }

            if (row == 1) {
                data.common.languages.defaultLanguageCode = langCode
            }
            data.common.languages.supportedLanguages.push({ code: langCode, name: langName, fallbackLanguage: fallbackLang })
        }
    }

    function getMultilingualBestFitColumnIndex(headers, columnName, language, subTableName) {
        //try with given language
        let colIndex = indexOfCaseInsensitive(headers, columnName + ":" + language)
        //try with default language code
        if (colIndex < 0) {
            colIndex = indexOfCaseInsensitive(headers, columnName + ":" + data.common.languages.defaultLanguageCode)
        }
        //try without default language code
        if (colIndex < 0) {
            colIndex = indexOfCaseInsensitive(headers, columnName)
        }
        if (colIndex < 0) {
            throw _tf("dm_column_not_found", [columnName, subTableName])
        }
        return colIndex
    }

    function getCellFromSubTable(subTable, rowIndex, columnName, language, subTableName) {
        let colIndex = getMultilingualBestFitColumnIndex(subTable[0], columnName, language, subTableName)

        let value = subTable[rowIndex][colIndex]
        return value
    }

    function subTableToMultilingualObject(workbook, sheetName, tableInfo, lang) {
        let loadedData = []

        let sheetData = loadSheet(workbook, sheetName)
        let rawSubTable = getSubTable(sheetName, sheetData, tableInfo.name, tableInfo, lang)

        for (let row = 1; row < rawSubTable.length; row++) {
            let lineObject = {}
            Object.keys(tableInfo.columns).forEach(function (columnKey) {
                lineObject[columnKey] = getCellFromSubTable(rawSubTable, row, tableInfo.columns[columnKey].name, lang.code, tableInfo.name)
            })
            loadedData.push(lineObject)
        }

        return loadedData
    }

    function getSubTable(sheetName, sheetData, tableName, tableInfo, lang) {
        if (sheetData.length < 2) {
            throw 'Cannot find table ' + tableName + ' in the worksheet ' + sheetName
        }

        let tableStartCol = indexOfCaseInsensitive(sheetData[0], tableName)
        if (tableStartCol < 0) {
            throw 'Cannot find table ' + tableName + ' in the worksheet ' + sheetName
        }

        let tableEndCol = sheetData[1].indexOf("", tableStartCol)
        if (tableEndCol < 0) {
            tableEndCol = sheetData[1].length
        }

        let subTable = []
        for (let row = 1; row < sheetData.length; row++) {
            const cells = sheetData[row].slice(tableStartCol, tableEndCol)

            if (isArrayOfEmptyStrings(cells)) {
                break
            }
            subTable.push(cells)
        }

        checkCollumnNames(subTable[0])

        return subTable

        function checkCollumnNames(headers) {

            headers.forEach(function (header) {
                //check if we have a situation where there is both "column" and "column:defaultLanguage" column names, which woudl be ambiguous
                if (header.indexOf(":") > 0 && indexOfCaseInsensitive(headers, header + ":" + data.common.languages.defaultLanguageCode) >= 0) {
                    throw "You have both '" + header + "' and '" + header + ":" + data.common.languages.defaultLanguageCode + "' in table '" + tableName + "' - to prevent ambiguity, keep only the '" + header + "' column"
                }
                //check if we have more than one : in the column name
                if (header.split(":").length > 2) {
                    throw "Colum name '" + header + "'  in table '" + tableName + "' is malformed - only one symbol ':' is allowed, which separates the column name from the language code"
                }
            })

            if (tableInfo) {
                //verify here that all columns are following integritys "supportMultilingual" rule
                Object.keys(tableInfo.columns).forEach(function (columnKey) {
                    let columnMeta = tableInfo.columns[columnKey]
                    if (!columnMeta.integrity.supportsMultilingual) {
                        let multilingualColumns = []
                        subTable[0].forEach(function (header) {
                            if (header.toLowerCase() == columnMeta.name.toLowerCase() + ":" + lang.code.toLowerCase()) {
                                multilingualColumns.push(header.substring(columnMeta.name.length))
                            }
                        })
                        if (multilingualColumns.length > 0) {
                            log("error", _tf("dm_cannot_have_language_indicators", [columnMeta.name, tableInfo.name, multilingualColumns.join(", ")]))
                        }
                    }
                })
            }
        }
    }

    function loadSheet(workbook, sheetName) {
        let rawSheetData = readSheetToJSON(workbook, sheetName)
        if (!rawSheetData) {
            throw "Could not find the sheet '" + sheetName + "' in the spreadsheet you provided. This sheet contains critical information about the checklist data you upload and needs to be present and contain the appropriate information (see documentation)."
        }
        return rawSheetData
    }

    function readSheetToJSON(workbook, sheetName) {
        if (workbook.SheetNames.indexOf(sheetName) < 0) {
            log("error", _tf("dm_cannot_find_sheet", [sheetName]))
            return null
        }

        let worksheet = workbook.Sheets[sheetName]
        let range = XLSX.utils.decode_range(worksheet["!ref"])
        let rawData = []
        for (let row = range.s.r; row <= range.e.r; row++) {
            let i = rawData.length
            rawData.push([])
            for (let col = range.s.c; col <= range.e.c; col++) {
                let cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })]
                rawData[i].push(cell ? cell.v : "")
            }
        }

        return rawData
    }

    let workbook = null
    function readWorkbook(excelFile) {
        if (workbook == null) {
            workbook = XLSX.read(excelFile, {
                type: "binary",
                cellText: false,
                cellDates: true
            })
        }

        return workbook
    }

    // Object to return
    let log = null
    let data = null

    let excelImport = {
        loadMeta: function (dataManagerData, logFunction) {
            log = logFunction
            data = dataManagerData

            let workbook = readWorkbook(excelFile)

            //get first info on languages
            loadKnownLanguages(workbook)

            //then process all the known tables
            loadMetaStructure(workbook)
        },

        workbookSheetNames: function () {
            let workbook = readWorkbook(excelFile)

            return workbook.SheetNames
        },

        getRawSheetData: function (dataSheetName) {

            let workbook = readWorkbook(excelFile)

            let sheetData = loadSheet(workbook, dataSheetName)
            //console.log(dataSheetName, sheetData)
            let rawTable = []

            let tableStartCol = 0
            let tableEndCol = 1

            sheetData[0].forEach(function (header, index) {
                if (header !== undefined && header.toString().trim() != "") {
                    tableEndCol = index + 1
                }
            })

            for (let row = 0; row < sheetData.length; row++) {
                let cells = sheetData[row].slice(tableStartCol, tableEndCol)

                for (let column = 0; column < cells.length; column++) {
                    let cell = cells[column]

                    if (cell instanceof Date) {
                        cell = new Date(cell - cell.getTimezoneOffset() * 60 * 1000)
                        cells[column] = cell.getFullYear() + "-" + pad((cell.getMonth() + 1).toString(), 2, "0") + "-" + pad(cell.getDate().toString(), 2, "0")
                    }
                }

                if (isArrayOfEmptyStrings(cells)) {
                    break
                }
                rawTable.push(cells)
            }

            return rawTable
        },
    }

    return excelImport
}

export let dictionaryDataStructure = {
    common: {
        languages: {
            languagesTableName: "Supported interface languages",
            defaultLanguageCode: "",
            supportedLanguages: [], // first is default | {code: "en", name: "English", fallbackLanguage: "en"}
        },
        checklistHeadersStartRow: 1,
        allUsedDataPaths: {}, // allUsedDataPaths[lang.code] = dataPath
        _allColumnInfosCache: null,
        getAllColumnInfos: function (lang) {
            if (lang === undefined) {
                lang = this.languages.defaultLanguageCode
            }

            return dictionaryDataStructure.sheets.config.tables.sheetDataDetails.data[lang]
        }
    },
    sheets: {
        config: {
            skipAutoImport: true,
            name: "config",
            description: "This sheet allows you to configure the appearance of the data.",
            type: "meta",
            tables: {
                supportedLanguages: {
                    name: "Supported interface languages",
                    description: "This table allows for declaration of one or more languages in which the checklist is presented. It is possible to create checklists which will display data in different languages. See the <a href=\"us-birds.xlsx\">Birds of the US</a> sample checklist which is a bilingual English/French checklist, and scan through headers on all three sheets for column names ending with \":fr\" (French version) or \":en\" (default, English version). Once you have declared your language codes and names you wish to use (en / English and fr / French in the sample), you can append \":\" and langauge code (e.g. \":fr\") to columns which are allowed to be multilingual to mark them to be used for a specific language version of the checklist.\nYou have to define at least one language for your checklist.",
                    columns: {
                        code: {
                            name: "Code",
                            description: "Code of the language. The language on the first line is treated as the default language. Any column which has no language mention (:code) appended is treated as this default language.",
                            integrity: {
                                description: "The value should be a two-letter language code following ISO 639-1 in lowercase, see <a href=\"https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes\">Wikipedia</a>",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        name: {
                            name: "Name of language",
                            description: "Name of the language, which will be displayed in the main app menu language switch.",
                            integrity: {
                                description: "Language name, preferably in that language, e.g. English, Français, Česky, ...",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        fallback: {
                            name: "Fallback language",
                            description: "If you use a language Code of a language for which the user interface is not translated (e.g. the Inuktitut), you can specify here a code of the language which you prefer the user interface shows in (e.g. \"fr\" for French). Otherwise English will be used by default.",
                            integrity: {
                                description: "Two-letter code of any of the following supported user interface language codes: " + i18n.getSupportedLanguageCodes().join(", "),
                                allowDuplicates: "yes",
                                allowEmpty: true,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        }
                    }
                },
                customization: {
                    name: "Customization",
                    description: "This table allows for customization of some elements of the checklist. The entries in the column Item are fixed, you can change the value of cells in the column Value. This column can be multilingual, so if you have more than one language, say a bi-lingual English-French checklist, you can change the header to Value:en and add immediately to the right a new column with the header Value:fr",
                    columns: {
                        item: {
                            name: "Item",
                            description: "This column is pre-filled with a set of items defining certain behaviors of your checklist.",
                            integrity: {
                                description: "",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "list",
                                listItems: ["Portal name", "About section", "Date format"],
                                supportsMultilingual: false
                            }
                        },
                        value: {
                            name: "Value",
                            description: "Define the values for each of the items here. As this column is multilingual, you can have sevaral Value colums in this table (e.g. Value:en, Value:es and Value:fr side by side if you defined English, Spanish and French as languages of your checklist).",
                            integrity: {
                                description: "<ul><li><b>Color theme hue</b>: a number from 0 to 360 representing a hue of the color theme of the app. The default deep blue hue is 212. If you want to pick your own, find the hue with an online tool like <a href=\"https://hslpicker.com\">hslpicker.com</a> (use the value of the topmost slider). You can visually separate different language mutations of your checklist (if you make a multilingual one) by assigning different hues to different translations</li><li><b>Checklist name</b>: A short name which will appear in the header of the checklist app. E.g. Vascular flora of Vanuatu</li><li><b>About section</b>: a free-form text which will appear in the About section in the checklist menu. You can write there a short description of the checklist, contacts to its author or any other information. You can use <a href=\"#g-md\">Markdown<a/> to format your text including different heading levels, links, images (in folder 'usercontent' or hosted elsewhere), lists or other. If your text is more complex, you may wish to prepare it first in a text editor and when you are happy with the result, copy-paste it into the appropriate cell in this table</li><li><b>Name of checklist data sheet</b>: name of the sheet which contains the checklist data. By default this is called \"checklist\", but you can modify that if you need the sheet be called otherwise</li><li><b>Checklist data headers row</b>: By default the headers row is on line 1, but in case your data are designed otherwise and the checklist data headers are on any other row (e.g. headers are on row 2 because row 1 is occupied by supplementary infor for curators or any other data), put the row number here.</li><li><b>Date format</b>: If you dates in your checklist data sheet, you can determine here how the date will be shown in your checklist. Available formats, see: <a href=\"https://day.js.org/docs/en/display/format\">day.js.org</a>. You can define different formats for different language mutations (e.g. if you have English (en) and French (fr) defined as the checklist languages, you can have in the column Value:en a value MMM D, YYYY while the column Value:fr can have the more common French format YYYY/MM/DD). By default or if left empty the format is YYYY-MM-DD.</li></ul>",
                                allowDuplicates: "yes",
                                allowEmpty: true,
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        }
                    },
                    data: [],
                    getItem: function (itemName, langCode, defaultValue) {
                        let item = dictionaryDataStructure.sheets.config.tables.customization.data[langCode].find(function (row) {
                            return row.item == itemName
                        })

                        let value = item.value
                        if (value === null || value === undefined) {
                            return defaultValue
                        }
                        return value
                    }
                },
                languageProjects: {
                    name: "Language projects",
                    description: "",
                    columns: {
                        projectName: {
                            name: "Project name",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        projectTag: {
                            name: "Project tag",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        isoCode: {
                            name: "ISO code",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        menuPath: {
                            name: "Menu path",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        translations: {
                            name: "Translations",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        languageName: {
                            name: "Language name",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        specialLetters: {
                            name: "Special letters",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        password: {
                            name: "Password",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: false,
                                doNotExport: true
                            }
                        },
                    },
                    data: []
                },
                menuItems: {
                    name: "Menu items",
                    description: "",
                    columns: {
                        tableType: {
                            name: "Table type",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        title: {
                            name: "Title",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        icon: {
                            name: "Icon",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                    }
                },
                sheetDataDetails: {
                    name: "Sheet data details",
                    description: "",
                    columns: {
                        tableType: {
                            name: "Table type",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        columnName: {
                            name: "Column name",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "dataPath",
                                supportsMultilingual: false
                            }
                        },
                        filterTitle: {
                            name: "Filter title",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        type: {
                            name: "Type",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                allowedContent: "list",
                                defaultValue: "complex",
                                listItems: ["", "id", "complex", "tree-items", "main", "text", "ref-list", "text", "audio", "images", "file-audio", "file-image", "folder-images", "markdown"],
                                supportsMultilingual: false
                            }
                        },
                        referenceToTableType: {
                            name: "Reference to table type",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        searchPriority: {
                            name: "Search priority",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                    },
                    data: []
                },
                layouts: {
                    name: "Layouts",
                    description: "",
                    columns: {
                        tableType: {
                            name: "Table type",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "yes",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        viewType: {
                            name: "View type",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "yes",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        placement: {
                            name: "Placement",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "yes",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        renderAs: {
                            name: "Render as",
                            description: "",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                allowedContent: "list",
                                listItems: ["", "audio", "image", "chip-filter", "chip-single-item-view", "chip-search-text", "list-of-references-in:*", "chip-external-url"],
                                supportsMultilingual: false
                            }
                        },
                        columnName: {
                            name: "Column name",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "yes",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        title: {
                            name: "Title",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "yes",
                                allowEmpty: true,
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        itemsSeparator: {
                            name: "Items separator",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "yes",
                                allowEmpty: true,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        template: {
                            name: "Template",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "yes",
                                allowEmpty: true,
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        style: {
                            name: "Style",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "yes",
                                allowEmpty: true,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        filter: {
                            name: "Filter",
                            description: "",
                            integrity: {
                                description: "",
                                allowDuplicates: "yes",
                                allowEmpty: true,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                    }
                },
            }
        }
    }
}