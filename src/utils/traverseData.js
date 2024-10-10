export default function traverseData(obj, options, pathHashless, accumulator, parentObj) {
    // if pathHashless is "*", then the entire data object will be traversed
    if (!pathHashless) {
        pathHashless = "*"
    }

    let {
        getter = false, //if getter is true, then terminal (leaf) obj is returned
        modifier = undefined, //a function that directly modifies terminal (leaf) objs
        remover = undefined, //a function that takes the matched part property and removes it if it returns true
    } = options || {}

    if (accumulator === undefined) {
        accumulator = ""
    }

    const pathMatchesPossibly = (path, acc) => (path === acc || path.startsWith(acc + (acc == "" ? "" : ".")) || path === "*");
    const pathMatchesExactly = (path, acc) => (path === acc);

    /*
    if (remover && accumulator == pathHashless) {
        if (remover(obj)) {
            let lastPathPart = pathHashless.split(".").at(-1)
            delete parentObj[lastPathPart]
            return parentObj;
        }
    }
    */

    let dataToReturn = []

    if (Array.isArray(obj) && pathMatchesPossibly(pathHashless, accumulator)) {
        
        if (remover && pathHashless == accumulator) {
            for (let i = 0; i < obj.length; i++) {
                if((typeof obj[i] === 'string' || obj[i] instanceof String) && remover(obj[i]))
                {
                    delete obj[i]
                }
            }
        }

        if (pathMatchesExactly(pathHashless, accumulator)) {
            if (getter) {
                return obj
            }
        }
        else {
            for (let i = 0; i < obj.length; i++) {
                const element = obj[i]

                if ((typeof obj[i] === 'string' || obj[i] instanceof String) && (pathHashless === accumulator || pathHashless === "*")) {
                    if (modifier) {
                        obj[i] = modifier(obj[i])
                    }
                    if (getter) {
                        dataToReturn.push((obj[i]))
                    }
                }
                else {
                    if (getter) {
                        dataToReturn.push(...traverseData(element, options, pathHashless, accumulator, obj))
                    }
                    else {
                        traverseData(element, options, pathHashless, accumulator, obj)
                    }
                }
            }
        }
    }
    else if (typeof obj === 'object' && pathMatchesPossibly(pathHashless, accumulator)) {
        if (pathMatchesExactly(pathHashless, accumulator)) {
            if (getter) {
                return obj
            }
        }
        else {
            for (let i = 0; i < Object.keys(obj).length; i++) {
                const key = Object.keys(obj)[i]

                if (remover && accumulator + "." + key == pathHashless && (typeof obj[key] === 'string' || obj[key] instanceof String)) {
                    if (remover(obj[key])) {
                        delete obj[key]
                    }
                }

                if ((typeof obj[key] === 'string' || obj[key] instanceof String) && (pathHashless === (accumulator == "" ? "" : accumulator + ".") + key || pathHashless === "*")) {
                    if (modifier) {
                        obj[key] = modifier(obj[key])
                    }
                    if (getter) {
                        dataToReturn.push((obj[key]))
                    }
                } else {
                    if (getter) {
                        dataToReturn.push(...traverseData(obj[key], options, pathHashless, (accumulator == "" ? "" : accumulator + ".") + key, obj))
                    }
                    else {
                        traverseData(obj[key], options, pathHashless, (accumulator == "" ? "" : accumulator + ".") + key, obj)
                    }
                }
            }
        }
    }

    if (getter) {
        return dataToReturn
    }
}