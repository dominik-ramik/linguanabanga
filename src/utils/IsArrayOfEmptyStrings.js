export function isArrayOfEmptyStrings(arr) {
    let someCellsFilled = arr.find(function (cell) {
        return cell.length > 0;
    });
    return !someCellsFilled;
}