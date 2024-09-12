export function unicodeSubstring(str, start, end) {
    let result = '';
    let index = 0;
    let charCount = 0;

    while (index < str.length && charCount < end) {
        const char = str[index];
        const code = char.codePointAt(0);

        if (charCount >= start) {
            result += String.fromCodePoint(code);
        }

        index += code > 0xFFFF ? 2 : 1;
        charCount++;
    }

    return result;
}