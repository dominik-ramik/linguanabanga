import { useDictionaryStore } from "@/store/DictionaryStore.js";

export function deepCheckHasDisplayableData(data, layout, lastId, paramsOfRenderAs) {
    if (!data || !layout) {
        return false
    }

    if (layout.meta.renderAs) {
        const renderAs = layout.meta.renderAs.split(':')[0]
        switch (renderAs) {
            case "list-of-references-in":
                return data !== undefined || data.id !== undefined || lastId !== undefined
                
                //FIXME this behaver wrongly, should getReferencesList and check if it is empty to return false
                
                console.log("Layout table", layout.meta.tableType)
                console.log("Params render as", paramsOfRenderAs)
                console.log(data, lastId)

                if (paramsOfRenderAs === undefined) {
                    return false
                }
                const dictionaryStore = useDictionaryStore();

                let reflist = dictionaryStore.getReferencesList(
                    data,
                    layout.meta.tableType,
                    paramsOfRenderAs[0]
                )

                if (data == "alan_rawi") {
                    console.log("Layout table", layout.meta.tableType)
                    console.log("Params render as", paramsOfRenderAs)
                    console.log(data, lastId, reflist)
                }
                return reflist.length > 0
            case "chip-single-item-view":
                return data !== undefined || data.id !== undefined || lastId !== undefined
            case "chip-search-text":
                return data !== undefined
            case "chip-external-url":
                return data !== undefined
            case "chip-filter":
                return data.id !== undefined
            case "audio":
                return data.source !== undefined
            case "image":
                return data.source !== undefined
            default:
                console.error("Unknown renderAs: '" + layout.meta.renderAs + "'")
                break;
        }
    } else {
        if (!layout.properties && !layout.each && data) {
            return true;
        }
        else if (layout.properties && data) {
            return layout.properties.map((prop) => {
                return deepCheckHasDisplayableData(data[prop.name], prop, lastId, paramsOfRenderAs)
            }).includes(true)
        }
        else if (layout.each && data) {
            return data.map((arrayItem) => {
                return deepCheckHasDisplayableData(arrayItem, layout.each, lastId, paramsOfRenderAs)
            }).includes(true)
        }
    }
    return false;
}