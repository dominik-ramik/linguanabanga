export default function trimChar(text, charToTrim) {
    if (text.length == 0) {
        return text
    }
    text = (text.charAt(0) === charToTrim[0]) ? text.substring(1) : text;
    if (text.length == 0) {
        return text
    }
    text = (text.charAt(text.length - 1) === charToTrim[0]) ? text.slice(0, -1) : text;
    return text
}