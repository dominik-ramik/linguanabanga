// Normalizes text for accent- and case-insensitive comparison: "Colór" -> "color".
//
// The cache is a Map, not a plain object: with `{}` a lookup of "constructor", "toString" or "valueOf"
// finds Object.prototype members and returns a function instead of a string. It is also capped so that it
// cannot grow without bound while the user types (every keystroke is a new string).
const MAX_CACHE_ENTRIES = 250000
const cache = new Map()

export function removeAccents(text) {
    if (Array.isArray(text)) {
        return text.map((item) => removeAccents(item))
    }
    if (typeof text !== 'string' && !(text instanceof String)) {
        return text
    }

    const key = String(text)
    let treated = cache.get(key)

    if (treated === undefined) {
        treated = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

        if (cache.size >= MAX_CACHE_ENTRIES) {
            cache.clear()
        }
        cache.set(key, treated)
    }

    return treated
}