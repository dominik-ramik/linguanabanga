import getDataByPath from '@/utils/GetDataByPath.js'

export default function getMainItem(sheetDataDetails, tableType, data) {
    const mainItem = sheetDataDetails.find((mainItemMeta) => tableType == mainItemMeta.tableType && mainItemMeta.type == "main")
    if (mainItem === undefined) {
        return undefined
    }

    let content = getDataByPath(data, mainItem.columnName)
 
    return content
}

