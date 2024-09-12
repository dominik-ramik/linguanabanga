import { toRef } from 'vue'

export function useLayout(dictionaryMaybeRef, tableTypeMaybeRef, viewType) {
    //create a structure with layouts categorized in placement and in each placement grouped by individual layout chains
    const dictionary = toRef(dictionaryMaybeRef)
    const tableType = toRef(tableTypeMaybeRef)

    const groupedLayouts = {}
    const flatLayouts = {}
    dictionary.value.layouts?.forEach((layout) => {
        const layoutViewTypes = layout.viewType.split(',').map((item) => item.trim())
        if (layout.tableType == tableType.value && layoutViewTypes.includes(viewType)) {
            if (!flatLayouts[layout.placement] || flatLayouts[layout.placement].length == 0) {
                //immediately start a new group - [ [ ] ]
                flatLayouts[layout.placement] = [layout]
            }
            else{
                flatLayouts[layout.placement].push(layout)
            }

            
            if (!groupedLayouts[layout.placement] || groupedLayouts[layout.placement].length == 0) {
                //immediately start a new group - [ [ ] ]
                groupedLayouts[layout.placement] = [[layout]]
            }
            else {
                let lastGroupIndex = groupedLayouts[layout.placement].length - 1
                let firstLayoutInGroupIndex = 0
                let firstLayoutInGroup = groupedLayouts[layout.placement][lastGroupIndex][firstLayoutInGroupIndex]
                if (layout.columnName.startsWith(firstLayoutInGroup.columnName) && layout.columnName != firstLayoutInGroup.columnName) {
                    //put it into the same group
                    groupedLayouts[layout.placement][lastGroupIndex].push(layout)
                }
                else {
                    //begin a new group
                    groupedLayouts[layout.placement].push([layout])
                }
            }
        }
    })

    //transform grouped layouts into the tree-structured version
    const treefiedLayouts = {}
    Object.keys(groupedLayouts).forEach((placement) => {
        treefiedLayouts[placement] = []
        groupedLayouts[placement].forEach((layoutGroup) => {
            const treefiedLayout = []

            for (const layout of layoutGroup) {
                let ref = treefiedLayout
                //layout.closestReferenceToTable = findClosestUpstreamReference(layout.columnName).referenceToTableType
                layout.closestReferenceFilter = findClosestUpstreamReference(layout.columnName).columnName
                layout.columnName.replaceAll("#", ".#").split(".").forEach((pathSegment) => {

                    //bootstrap from empty value
                    if (Array.isArray(ref)) {
                        if (ref.find((prop) => prop.name == pathSegment) === undefined) {
                            ref.push({
                                name: pathSegment,
                                fullPath: layout.columnName,
                                fullPathHashless: layout.columnName.replaceAll("#", ""),
                                sheetDataDetails: dictionary.value.sheetDataDetails.find((detail) => detail.columnName == layout.columnName),
                                meta: layout,
                            })
                        }
                        ref = ref.find((prop) => prop.name == pathSegment)
                    }
                    else if (pathSegment == "#") {
                        if (!ref.each) {
                            ref.each = {
                                properties: [],
                                fullPath: layout.columnName,
                                fullPathHashless: layout.columnName.replaceAll("#", ""),
                                sheetDataDetails: dictionary.value.sheetDataDetails.find((detail) => detail.columnName == layout.columnName),
                                meta: layout,
                            }
                        }
                        ref = ref.each.properties
                    }
                    else if (ref.name && ref.name != pathSegment) {
                        if (!ref.properties) {
                            ref.properties = []
                        }
                        if (ref.properties.find((prop) => prop.name == pathSegment) === undefined) {
                            ref.properties.push({
                                name: pathSegment,
                                fullPath: layout.columnName,
                                fullPathHashless: layout.columnName.replaceAll("#", ""),
                                sheetDataDetails: dictionary.value.sheetDataDetails.find((detail) => detail.columnName == layout.columnName),
                                meta: layout,
                            })
                        }
                        ref = ref.properties.find((prop) => prop.name == pathSegment)
                    }

                    //console.log(layout.columnName, "|", pathSegment)
                    //console.log(JSON.stringify(treefiedLayout, null, " "))
                })
            }

            if (treefiedLayout.length == 0) {
                return
            }
            treefiedLayouts[placement].push(treefiedLayout[0]) //unwrap the array around the treefied layout
        })
    })

    //console.log("FLAT", flatLayouts)
    //console.log("TREE", treefiedLayouts)
    //console.log("head", treefiedLayouts["head"])
    //console.log("body", treefiedLayouts["body"])
    //console.log("details", treefiedLayouts["details"])

    return {tree: treefiedLayouts, flat: flatLayouts}

    function findClosestUpstreamReference(columnName) {
        let currentColumnName = columnName

        do {
            const currentDetail = dictionary.value.sheetDataDetails.find((detail) => detail.columnName == currentColumnName)
            if (currentDetail && currentDetail.referenceToTableType) {
                return currentDetail
            }
            if (currentDetail && currentDetail.referencedTable && currentDetail.referencedTable.referenceToTableType) {
                return currentDetail.referencedTable
            }

            if (currentColumnName.endsWith("#")) {
                currentColumnName = currentColumnName.substring(0, currentColumnName.length - 1)
            } else {
                currentColumnName = currentColumnName.substring(0, currentColumnName.lastIndexOf(".") || 0)
            }

        } while (currentColumnName.length > 0)

        return ""
    }
}