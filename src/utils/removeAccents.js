const cache = {}

export function removeAccents(text) {
    if (Array.isArray(text)) {
        return text.map((item) => removeAccents(item))
    }
    if (typeof text !== 'string' && !(text instanceof String)) {
        return text
    }

    if (cache[text]) {
        return cache[text]
    }

    if (!text || text === undefined) {
        cache[text] = text
        return text
    }

    let treated = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    cache[text] = treated

    return treated
}