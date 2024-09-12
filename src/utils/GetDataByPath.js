import traverseData from '@/utils/traverseData'

export default function getDataByPath(obj, path) {
    path = path.replaceAll("#", "")

    return traverseData(obj, {
        getter: true,
    }, path)
}