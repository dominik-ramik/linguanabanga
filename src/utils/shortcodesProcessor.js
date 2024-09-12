const OPENING_SYMBOL = "\u{F0000}"
const CLOSING_SYMBOL = "\u{F0001}"
const UNICODE_ID_START = 0xF0002

export function extractShortcodes(text, shortcodes, defaultTableType, replacementFunction) {
    //Fast way of checking a shortcode is present before wasting time with RegEx
    if (text.indexOf("{{") >= 0) {
        let shortcodeRegex = new RegExp("{{(.*?)}}", "gi");
        let matches = text.match(shortcodeRegex)

        for (const match of matches) {
            // remove the leading and tailing {{ and }}
            let path = match.substring(2, match.length - 2).trim().split(" ")[0]

            let tableType = defaultTableType
            let id = path
            if (path.indexOf("/") > 0) {
                let segments = path.split("/")
                tableType = segments[0]
                id = segments[1]
            }

            //find if shortcodes table already has this tableType and id
            let foundShortcode = shortcodes.find((shortcodeInfo) => shortcodeInfo.tableType == tableType && shortcodeInfo.id == id)
            if (foundShortcode === undefined) {
                foundShortcode = {
                    unicodeIdCharacter: String.fromCodePoint(shortcodes.length + UNICODE_ID_START),
                    tableType: tableType,
                    id: id
                }
                shortcodes.push(foundShortcode)
            }

            //construct replacement            
            const replacement = OPENING_SYMBOL + foundShortcode.unicodeIdCharacter + replacementFunction(tableType, id, match) + CLOSING_SYMBOL

            text = text.replace(match, replacement)
        }
    }

    return text
}

export function postprocessEncodedShortcode(text, shortcodes, shortcodeReplacer, plaintextReplacer) {
    let contentArray = []

    let after = text

    do {
        let start = text.indexOf(OPENING_SYMBOL)
        let end = text.indexOf(CLOSING_SYMBOL)

        if (start < 0 || end < start) {
            break
        }

        let before = text.substring(0, start)
        let inside = text.substring(start + OPENING_SYMBOL.length, end)
        let shortcodeInfo = shortcodes[inside.codePointAt(0) - UNICODE_ID_START]
        inside = inside.substring(OPENING_SYMBOL.length + String.fromCodePoint(inside.codePointAt(1)).length - 1)

        after = text.substring(end + CLOSING_SYMBOL.length)

        //contentArray.push(h(before))
        contentArray.push(plaintextReplacer(before))
        contentArray.push(shortcodeReplacer(inside, shortcodeInfo.tableType, shortcodeInfo.id))

        text = after

    } while (text.indexOf(OPENING_SYMBOL) >= 0)

    if (after.length > 0) {
        contentArray.push(plaintextReplacer(after))
    }

    return contentArray
}