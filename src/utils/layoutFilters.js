import traverseData from '@/utils/traverseData'

export function ensureUniqueValues(obj, path) {
    obj = JSON.parse(JSON.stringify(obj));
    path = path.replaceAll("#", "").toLowerCase();

    let uniques = []

    traverseData(obj, {
        remover: function (data) {
            let serialized = deterministicStringify(data)
            if (uniques.includes(serialized)) {
                return true
            }
            else {
                uniques.push(serialized)
                return false
            }
        },
    }, path);

    return obj
}

function deterministicStringify(obj) {
    function sortKeys(value) {
        if (Array.isArray(value)) {
            return value.map(sortKeys);
        } else if (value && typeof value === 'object') {
            return Object.keys(value).sort().reduce((result, key) => {
                result[key] = sortKeys(value[key]);
                return result;
            }, {});
        }
        return value;
    }

    return JSON.stringify(sortKeys(obj));
}

