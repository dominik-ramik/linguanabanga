export function normalizeURLPathname(origin, path) {
    if (path.slice(0, 4).toLowerCase() != "http") {
        path = origin + path
    }

    let pathname = null
    try {
        pathname = new URL(path).pathname
    }
    catch (err) {
        console.error("Error normalizing", origin, path, err)
    }
    return pathname;
}