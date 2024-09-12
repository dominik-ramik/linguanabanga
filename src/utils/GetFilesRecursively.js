export default async function getFilesRecursively(entry, files, path) {
    if (entry.kind === 'file') {
        const file = await entry.getFile()
        file.path_components = path
        files.push(file)
    } else if (entry.kind === 'directory') {
        for await (const handle of entry.values()) {
            path.push(handle.name)
            let newPath = path.map((p) => p)
            await getFilesRecursively(handle, files, newPath)
            path.pop()
        }
    }
}