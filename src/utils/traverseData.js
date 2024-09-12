export default function traverseData(obj, options, pathHashless, accumulator) {
    // if pathHashless is "*", then the entire data object will be traversed
    if (!pathHashless) {
        pathHashless = "*"
    }

    let {
        getter = false, //if getter is true, then terminal (leaf) obj is returned
        modifier = undefined, //a function that directly modifies terminal (leaf) objs
    } = options || {}

    if (accumulator === undefined) {
        accumulator = ""
    }

    const pathMatchesPossibly = (path, acc) => (path === acc || path.startsWith(acc + (acc == "" ? "" : ".")) || path === "*");
    const pathMatchesExactly = (path, acc) => (path === acc);

    let dataToReturn = []

    if (Array.isArray(obj) && pathMatchesPossibly(pathHashless, accumulator)) {
        if (pathMatchesExactly(pathHashless, accumulator) && getter) {
            return obj
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
                        dataToReturn.push(...traverseData(element, options, pathHashless, accumulator))
                    }
                    else {
                        traverseData(element, options, pathHashless, accumulator)
                    }
                }
            }
        }
    }
    else if (typeof obj === 'object' && pathMatchesPossibly(pathHashless, accumulator)) {
        if (pathMatchesExactly(pathHashless, accumulator) && getter) {
            return obj
        }
        else {
            for (let i = 0; i < Object.keys(obj).length; i++) {
                const key = Object.keys(obj)[i]

                if ((typeof obj[key] === 'string' || obj[key] instanceof String) && (pathHashless === (accumulator == "" ? "" : accumulator + ".") + key || pathHashless === "*")) {
                    if (modifier) {
                        obj[key] = modifier(obj[key])
                    }
                    if (getter) {
                        dataToReturn.push((obj[key]))
                    }
                } else {
                    if (getter) {
                        dataToReturn.push(...traverseData(obj[key], options, pathHashless, (accumulator == "" ? "" : accumulator + ".") + key))
                    }
                    else {
                        traverseData(obj[key], options, pathHashless, (accumulator == "" ? "" : accumulator + ".") + key)
                    }
                }
            }
        }
    }

    if (getter) {
        return dataToReturn
    }
}