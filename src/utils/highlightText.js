import { removeAccents } from "@/utils/removeAccents.js";

export function highlightText(text, matchesToHighlight, originalSearch, colorFullMatch, colorPartialMatch) {
  if (typeof text !== 'string' && !(text instanceof String)) {
    return text
  }
  if (!matchesToHighlight || matchesToHighlight.length == 0) {
    return text
  }

  if (matchesToHighlight.length > 0) {
    let q = removeAccents(originalSearch);
    let style = "border-radius: 0.25em;"

    for (const match of matchesToHighlight) {
      if (match.value.toLowerCase() == removeAccents(text).toLowerCase()) {
        text = match?.indices?.reduceRight(
          (s, ix) =>
            `${s.slice(
              0,
              ix[0]
            )}<span style="${style} background-color:${removeAccents(s.slice(ix[0], ix[1] + 1)) == q
              ? colorFullMatch
              : colorPartialMatch
            }">${s.slice(ix[0], ix[1] + 1)}</span>${s.slice(ix[1] + 1)}`,
          text
        )
      }
    }
  }

  return text
}