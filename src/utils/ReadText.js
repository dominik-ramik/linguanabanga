export default async function readText(fileItem) {
    let fileArrayBuffer = await fileItem.arrayBuffer()
    var enc = new TextDecoder('utf-8')
    //console.log("Reading " + fileItem.path_components)
    return enc.decode(fileArrayBuffer)
}