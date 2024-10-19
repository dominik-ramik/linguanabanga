export function normalizeURLPathname(origin, path) {
    if (path.slice(0, 3).toLowerCase() != "http") {
        path = origin + path
    }

    let pathname = new URL(path).pathname

    return pathname;
}