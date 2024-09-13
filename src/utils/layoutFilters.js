export function ensureUniqueValues(obj, path) {

    obj = JSON.parse(JSON.stringify(obj));

    const pathParts = path.split('.');
    const uniqueValues = new Set();

    function traverse(currentObj, currentPathIndex) {
        if (currentPathIndex === pathParts.length) {
            return;
        }

        const part = pathParts[currentPathIndex];
        const isArray = part.endsWith('#');
        const key = isArray ? part.slice(0, -1) : part;

        if (isArray && Array.isArray(currentObj[key])) {
            currentObj[key].forEach((item, index) => {
                traverse(item, currentPathIndex + 1);
            });
        } else if (currentObj[key] !== undefined) {
            traverse(currentObj[key], currentPathIndex + 1);
        }
    }

    function removeDuplicates(currentObj, currentPathIndex) {
        if (currentPathIndex === pathParts.length) {
            if (typeof currentObj === 'string' || typeof currentObj === 'number') {
                if (uniqueValues.has(currentObj)) {
                    return true;
                } else {
                    uniqueValues.add(currentObj);
                    return false;
                }
            }
            else {
                console.log(pathParts)
                let serialized = deterministicStringify(currentObj)
                if (uniqueValues.has(serialized)) {
                    console.log("CurrentObject", currentObj)
                    console.log("Serialized", serialized)
                    console.log("=======================")
                    return true;
                } else {
                    uniqueValues.add(serialized);
                    return false;
                }
            }
            return false;
        }

        const part = pathParts[currentPathIndex];
        const isArray = part.endsWith('#');
        const key = isArray ? part.slice(0, -1) : part;

        if (isArray && Array.isArray(currentObj[key])) {
            currentObj[key] = currentObj[key].filter((item) => !removeDuplicates(item, currentPathIndex + 1));
        } else if (currentObj[key] !== undefined) {
            if (removeDuplicates(currentObj[key], currentPathIndex + 1)) {
                delete currentObj[key];
            }
        }
        return false;
    }

    traverse(obj, 0);
    removeDuplicates(obj, 0);
    return obj;
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

