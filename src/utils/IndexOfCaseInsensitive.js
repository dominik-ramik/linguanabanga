import { toLowerCaseAccentless } from "./removeAccents.js"

let indexOfCaseInsensitiveAccentlessCache = {}
export function indexOfCaseInsensitiveAccentless(haystack, needle) {
    if(typeof haystack !== 'string' && !(haystack instanceof String)) return -1
    if(typeof needle !== 'string' && !(needle instanceof String)) return -1

    if (!Object.prototype.hasOwnProperty.call(indexOfCaseInsensitiveAccentlessCache, haystack)) {
        indexOfCaseInsensitiveAccentlessCache[haystack] = toLowerCaseAccentless(haystack)
    }
    haystack = indexOfCaseInsensitiveAccentlessCache[haystack]

    if (!Object.prototype.hasOwnProperty.call(indexOfCaseInsensitiveAccentlessCache, needle)) {
        indexOfCaseInsensitiveAccentlessCache[needle] = toLowerCaseAccentless(needle)
    }
    needle = indexOfCaseInsensitiveAccentlessCache[needle]

    return haystack.indexOf(needle)
}