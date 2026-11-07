/**
 * textSearch.js - ranked full-text search over dictionary entries.
 *
 * WHY THIS EXISTS
 * Fuse.js is a fuzzy matcher. With `ignoreLocation: true` it has no notion of "starts with", and its final
 * score mixes in the number of searched keys and the length of the field, so on its own it neither ranks a
 * prefix match first nor reliably keeps a perfect partial match. Here ranking is ours and deterministic;
 * Fuse is used only for the last, typo-tolerant tier.
 *
 * HOW A RESULT IS RANKED (best tier of any searched field wins; lower tier = higher in the list)
 *
 *   tier  meaning                                              query "myristica" matches...
 *   ----  ---------------------------------------------------  ---------------------------
 *    0    the field IS the query                               "Myristica"
 *    1    field starts with the query, ends on a word edge     "Myristica neoebudica"
 *    2    field starts with the query, ends mid-word           "Myristicaceae"
 *    3    a later word starts with the query                   "neoebudica Myristica"
 *    4    the query occurs anywhere else                       "Pseudomyristica"
 *    5    same letters, different spacing/punctuation          "nekiapen" ~ "nek iapen", "nek-iapen"
 *         (strict and liberal modes only)
 *    6    approximate match (Fuse.js; strict/liberal only)     "Myristika"
 *
 * Inside tiers 0-5: higher column weight first (weight = 1 / searchPriority), then the SHORTER field first
 * (closer to a full match), then alphabetical by main entry. Inside tier 6: Fuse's score, then alphabetical.
 *
 * Everything is accent- and case-insensitive (see removeAccents.js).
 *
 * RESULT SHAPE (kept compatible with what Fuse produced, the UI reads it in highlightText,
 * DynamicDataContainer and DynamicDataCard):
 *   { item, refIndex, score, tier, matches: [{ key, value, indices, refIndex }] }
 *   - matches[].key     searched column path without '#'
 *   - matches[].value   the NORMALIZED text of the matching value (what highlightText compares against)
 *   - matches[].indices inclusive [start, end] spans inside that value; exact spans for tiers 0-5,
 *                       Fuse's character-mask runs for tier 6
 */
import Fuse from "fuse.js"
import { removeAccents } from "@/utils/removeAccents.js"

export const MatchTier = Object.freeze({
    EXACT: 0,
    STARTS_WITH_WORD: 1,
    STARTS_WITH: 2,
    WORD_START: 3,
    SUBSTRING: 4,
    IGNORING_SEPARATORS: 5,
    FUZZY: 6,
})

/**
 * Search strictness. `exact` is literal (tiers 0-4); the other two also accept spacing/punctuation variants
 * (tier 5) and typos (tier 6).
 * - ignoreSeparators: "nekiapen" finds "nek iapen" and the other way round
 * - threshold: maximum error RATIO (edits / query length). Short queries are bounded by this...
 * - maxErrors: ...and long queries by this absolute cap. Without it the ratio alone lets a 9-letter query in
 *              liberal mode (0.7) differ by 6 letters, i.e. "match" nearly every entry.
 * - fidelity:  share of the query that must match contiguously (see minMatchCharLength below)
 */
export const SEARCH_MODES = Object.freeze({
    exact: Object.freeze({ fuzzy: false, ignoreSeparators: false }),
    strict: Object.freeze({ fuzzy: true, ignoreSeparators: true, threshold: 0.4, maxErrors: 2, fidelity: 0.5 }),
    liberal: Object.freeze({ fuzzy: true, ignoreSeparators: true, threshold: 0.7, maxErrors: 3, fidelity: 0.4 }),
})

export const DEFAULT_SEARCH_MODE = "strict"

// Below this length an approximate match is mostly noise (a 2-letter query "matches" almost everything in
// liberal mode) and tiers 0-4 already cover every literal occurrence.
const FUZZY_MIN_QUERY_LENGTH = 3

// Letters needed (separators not counted) before ignoring separators makes sense: with fewer, a query would
// "match" across unrelated neighbouring words ("kia" inside "nek iapen").
const SEPARATOR_INSENSITIVE_MIN_LENGTH = 4

function resolveMode(mode) {
    return Object.hasOwn(SEARCH_MODES, mode) ? SEARCH_MODES[mode] : SEARCH_MODES[DEFAULT_SEARCH_MODE]
}

// ---------------------------------------------------------------------------------------------------------------------
// Normalization and word boundaries
// ---------------------------------------------------------------------------------------------------------------------

/** Accent/case-insensitive, whitespace-collapsed and trimmed (a trailing space from a phone keyboard must not matter). */
export function normalizeQuery(text) {
    if (typeof text !== "string") {
        return ""
    }
    return removeAccents(text).replace(/\s+/g, " ").trim()
}

// Letters, digits and combining marks of any script count as part of a word; everything else separates words.
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u

function isWordCharAt(text, index) {
    return index >= 0 && index < text.length && WORD_CHAR.test(text.charAt(index))
}

const startsAtWordBoundary = (text, start) => !(isWordCharAt(text, start - 1) && isWordCharAt(text, start))
const endsAtWordBoundary = (text, end) => !(isWordCharAt(text, end - 1) && isWordCharAt(text, end))

/** Number of leading non-word characters, so that `"Myristica"` or `(Myristica)` still count as starting with it. */
function leadingNonWordLength(text) {
    const firstWordChar = text.search(WORD_CHAR)
    return firstWordChar < 0 ? text.length : firstWordChar
}

// ---------------------------------------------------------------------------------------------------------------------
// Index: every searched value of every entry, extracted and normalized ONCE per dataset
// ---------------------------------------------------------------------------------------------------------------------
const NON_SPACE_WHITESPACE = /[^\S ]/
const NON_SPACE_WHITESPACE_GLOBAL = /[^\S ]/g

function toSearchableValue(raw) {
    // `norm` is the value highlightText compares against, so it must be exactly removeAccents(raw).
    const norm = removeAccents(raw)
    // `hay` is what we search in: line breaks/tabs/nbsp become plain spaces (1:1, so indices stay valid).
    const hay = NON_SPACE_WHITESPACE.test(norm) ? norm.replace(NON_SPACE_WHITESPACE_GLOBAL, " ") : norm
    return { norm, hay, squashed: undefined } // `squashed` is computed on first use, see squashedOf()
}

/**
 * Collects the strings found at a dotted path, walking through arrays on the way
 * ("examples.text" works whether `examples` is an object or an array of objects).
 * Numbers are searchable too; other value types are ignored.
 */
function collectStrings(node, segments, depth, out) {
    if (node === undefined || node === null) {
        return
    }
    if (depth === segments.length) {
        if (typeof node === "string") {
            out.push(node)
        } else if (typeof node === "number") {
            out.push(String(node))
        } else if (Array.isArray(node)) {
            for (const element of node) {
                collectStrings(element, segments, depth, out)
            }
        }
        return
    }
    if (Array.isArray(node)) {
        for (const element of node) {
            collectStrings(element, segments, depth, out)
        }
        return
    }
    if (typeof node === "object") {
        collectStrings(node[segments[depth]], segments, depth + 1, out)
    }
}

/**
 * @typedef {{ name: string, weight: number }} SearchKey   name = dotted path without '#', weight > 0
 * @typedef {{ items: object[], fuseKeys: SearchKey[], entries: Map<object, object[]>, fuseIndex: object|null }} TextSearchIndex
 */

/**
 * Builds the search index for `items`. Cheap to keep around, expensive to rebuild: create it once per
 * (dataset, keys) and reuse it for every query (e.g. inside a Vue `computed`).
 *
 * @param {object[]} items
 * @param {SearchKey[]} keys
 * @returns {TextSearchIndex}
 */
export function buildTextSearchIndex(items, keys) {
    const preparedKeys = keys.map(({ name, weight }) => ({ name, weight, segments: name.split(".") }))
    const entries = new Map()

    for (const item of items) {
        const fields = []

        for (const key of preparedKeys) {
            const rawValues = []
            collectStrings(item, key.segments, 0, rawValues)

            const values = []
            for (const raw of rawValues) {
                if (raw.trim() !== "") {
                    values.push(toSearchableValue(raw))
                }
            }
            if (values.length > 0) {
                fields.push({ key: key.name, weight: key.weight, values })
            }
        }

        entries.set(item, fields)
    }

    return {
        items,
        fuseKeys: keys.map(({ name, weight }) => ({ name, weight })),
        entries,
        fuseIndex: null, // built lazily, only if a fuzzy search is ever run
    }
}

// Fuse's own index is built from OUR already normalized values, so it never re-walks the data or re-normalizes it.
function getFuseIndex(index) {
    if (!index.fuseIndex) {
        index.fuseIndex = Fuse.createIndex(index.fuseKeys, index.items, {
            getFn: (item, path) => {
                const name = Array.isArray(path) ? path.join(".") : path
                const field = index.entries.get(item)?.find((candidate) => candidate.key === name)
                return field ? field.values.map((value) => value.norm) : undefined
            },
        })
    }
    return index.fuseIndex
}

// ---------------------------------------------------------------------------------------------------------------------
// Deterministic matching (tiers 0-4)
// ---------------------------------------------------------------------------------------------------------------------
function tierOfOccurrence(hay, start, length, leadingNonWord) {
    if (start <= leadingNonWord) {
        // the occurrence opens the field
        return endsAtWordBoundary(hay, start + length) ? MatchTier.STARTS_WITH_WORD : MatchTier.STARTS_WITH
    }
    return startsAtWordBoundary(hay, start) ? MatchTier.WORD_START : MatchTier.SUBSTRING
}

/** @returns {{ tier: number, spans: number[][] } | null} best tier over all occurrences, and every occurrence as [start, end] */
function classifyValue(hay, query) {
    if (hay === query) {
        return { tier: MatchTier.EXACT, spans: [[0, query.length - 1]] }
    }

    let start = hay.indexOf(query)
    if (start < 0) {
        return null
    }

    const leadingNonWord = leadingNonWordLength(hay)
    const spans = []
    let tier = MatchTier.SUBSTRING

    while (start >= 0) {
        spans.push([start, start + query.length - 1])
        tier = Math.min(tier, tierOfOccurrence(hay, start, query.length, leadingNonWord))
        start = hay.indexOf(query, start + query.length)
    }

    return { tier, spans }
}

// Spacing/punctuation-insensitive matching (tier 5) ---------------------------------------------------------------
const NON_WORD_RUNS = /[^\p{L}\p{N}\p{M}]+/gu

/** Text without spaces and punctuation: "nek-iapen" -> "nekiapen". */
const squash = (text) => text.replace(NON_WORD_RUNS, "")

// Computed on first use, so exact-mode users never pay for it; reuses the same string when there is nothing to remove.
function squashedOf(value) {
    if (value.squashed === undefined) {
        value.squashed = squash(value.hay)
    }
    return value.squashed
}

/** For every character kept by squash(): where it starts and ends in `text` (one entry per UTF-16 unit). */
function mapSquashedPositions(text) {
    const starts = []
    const ends = []
    let index = 0

    for (const character of text) { // iterates code points, like the /u regex above
        if (WORD_CHAR.test(character)) {
            for (let unit = 0; unit < character.length; unit++) {
                starts.push(index)
                ends.push(index + character.length - 1)
            }
        }
        index += character.length
    }

    return { starts, ends }
}

/**
 * @returns {{ spans: number[][], opensValue: boolean } | null} spans cover the separators that sit inside the match,
 * so "nek iapen" is highlighted as a whole; `opensValue` = the match starts at the first letter of the value
 */
function classifyIgnoringSeparators(value, squashedQuery) {
    const squashed = squashedOf(value)
    let from = squashed.indexOf(squashedQuery)
    if (from < 0) {
        return null
    }

    const { starts, ends } = mapSquashedPositions(value.hay)
    const opensValue = from === 0
    const spans = []

    while (from >= 0) {
        spans.push([starts[from], ends[from + squashedQuery.length - 1]])
        from = squashed.indexOf(squashedQuery, from + squashedQuery.length)
    }

    return { spans, opensValue }
}

// "better" = lower tier, then heavier column, then shorter field
function isBetterMatch(a, b) {
    if (a.tier !== b.tier) return a.tier < b.tier
    if (a.weight !== b.weight) return a.weight > b.weight
    return a.length < b.length
}

function recordMatch(state, field, value, index, tier, spans) {
    state.matches.push({ key: field.key, value: value.norm, indices: spans, refIndex: index })

    const candidate = { tier, weight: field.weight, length: value.hay.length }
    if (!state.best || isBetterMatch(candidate, state.best)) {
        state.best = candidate
    }
}

/**
 * Looks at every searched value of one entry: returns its best match plus a `matches` list for highlighting.
 * `squashedQuery` is "" when spacing/punctuation-insensitive matching does not apply.
 */
function matchEntry(fields, query, squashedQuery, maxTier, startsWithOnly) {
    const state = { best: null, matches: [] }

    for (const field of fields) {
        for (let i = 0; i < field.values.length; i++) {
            const value = field.values[i]
            const hit = classifyValue(value.hay, query)
            if (hit && hit.tier <= maxTier) {
                recordMatch(state, field, value, i, hit.tier, hit.spans)
            }
        }
    }

    // Only when nothing matched literally: same letters, different spacing/punctuation ("nekiapen" ~ "nek iapen")
    if (!state.best && squashedQuery) {
        for (const field of fields) {
            for (let i = 0; i < field.values.length; i++) {
                const value = field.values[i]
                const hit = classifyIgnoringSeparators(value, squashedQuery)
                if (hit && (!startsWithOnly || hit.opensValue)) {
                    recordMatch(state, field, value, i, MatchTier.IGNORING_SEPARATORS, hit.spans)
                }
            }
        }
    }

    return state.best ? { ...state.best, matches: state.matches } : null
}

// ---------------------------------------------------------------------------------------------------------------------
// Fuzzy matching (tier 6)
// ---------------------------------------------------------------------------------------------------------------------
function opensAField(matches) {
    return matches.some((match) => match.indices.some(([start]) => start === 0))
}

function searchFuzzy(index, query, settings, candidates, alreadyMatched, startsWithOnly) {
    // Characters of the query that must match in one contiguous run; shorter queries must match (almost) fully.
    const minMatchCharLength = query.length > 3 ? Math.round(query.length * settings.fidelity) : query.length - 1

    // Fuse accepts a match when edits / query.length <= threshold, so threshold = maxErrors / length allows at most
    // `maxErrors` edits for long queries while short queries stay bound by the ratio.
    const threshold = Math.min(settings.threshold, settings.maxErrors / query.length)

    const fuse = new Fuse(
        index.items,
        {
            keys: index.fuseKeys,
            threshold,
            minMatchCharLength,
            ignoreLocation: true,
            includeMatches: true,
            includeScore: true,
            isCaseSensitive: false,
        },
        getFuseIndex(index),
    )

    // Fuse searches the whole indexed dataset; keep only what the facet/media filters currently allow,
    // and what the deterministic tiers have not already ranked.
    const allowed = new Set(candidates)
    const found = []

    for (const result of fuse.search(query)) {
        if (!allowed.has(result.item) || alreadyMatched.has(result.item)) {
            continue
        }
        // Fuse reports character-mask runs rather than exact spans, so this "starts with" test is approximate.
        if (startsWithOnly && !opensAField(result.matches)) {
            continue
        }
        found.push({ item: result.item, fuzzyScore: result.score, matches: result.matches.map((match) => ({ ...match })) })
    }

    return found
}

// ---------------------------------------------------------------------------------------------------------------------
// Ordering helpers
// ---------------------------------------------------------------------------------------------------------------------
const collator = new Intl.Collator()

/** Compares main-entry strings alphabetically for the current locale; entries without one go last. */
export function compareSortKeys(a, b) {
    if (a === undefined && b === undefined) return 0
    if (a === undefined) return 1
    if (b === undefined) return -1
    return collator.compare(a, b)
}

function compareRanked(a, b, getSortKey) {
    if (a.tier !== b.tier) {
        return a.tier - b.tier
    }
    if (a.tier === MatchTier.FUZZY) {
        if (a.fuzzyScore !== b.fuzzyScore) return a.fuzzyScore - b.fuzzyScore
    } else {
        if (a.weight !== b.weight) return b.weight - a.weight
        if (a.length !== b.length) return a.length - b.length
    }
    return compareSortKeys(getSortKey(a.item), getSortKey(b.item)) || a.sequence - b.sequence
}

// ---------------------------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Searches `candidates` (the entries that pass the current filters; all must have been indexed) and returns
 * them best-first. An empty query returns [].
 *
 * @param {TextSearchIndex} index
 * @param {object} options
 * @param {string} options.query                   raw user text; normalized here
 * @param {object[]} options.candidates            entries to search in
 * @param {string} [options.mode]                  "exact" | "strict" | "liberal"
 * @param {boolean} [options.startsWithOnly]       "entry starts with" mode: tiers 0-2, separator-insensitive hits that open
 *                                                 the value, and (approximately) fuzzy hits that open a field
 * @param {(item: object) => (string|undefined)} [options.getSortKey]   main-entry text used to break ties alphabetically
 */
export function searchText(index, { query, candidates, mode, startsWithOnly = false, getSortKey = () => undefined }) {
    const normalizedQuery = normalizeQuery(query)
    if (normalizedQuery === "") {
        return []
    }

    const settings = resolveMode(mode)
    const maxTier = startsWithOnly ? MatchTier.STARTS_WITH : MatchTier.SUBSTRING

    const squashedQuery = settings.ignoreSeparators ? squash(normalizedQuery) : ""
    const separatorQuery = squashedQuery.length >= SEPARATOR_INSENSITIVE_MIN_LENGTH ? squashedQuery : ""

    const ranked = []
    const alreadyMatched = new Set()

    for (const item of candidates) {
        const fields = index.entries.get(item)
        const match = fields && matchEntry(fields, normalizedQuery, separatorQuery, maxTier, startsWithOnly)
        if (!match) {
            continue
        }
        alreadyMatched.add(item)
        ranked.push({ item, ...match, fuzzyScore: 0, sequence: ranked.length })
    }

    if (settings.fuzzy && normalizedQuery.length >= FUZZY_MIN_QUERY_LENGTH && index.fuseKeys.length > 0) {
        for (const found of searchFuzzy(index, normalizedQuery, settings, candidates, alreadyMatched, startsWithOnly)) {
            ranked.push({ ...found, tier: MatchTier.FUZZY, weight: 0, length: 0, sequence: ranked.length })
        }
    }

    ranked.sort((a, b) => compareRanked(a, b, getSortKey))

    return ranked.map((entry) => ({
        item: entry.item,
        refIndex: entry.item.id,
        score: entry.tier === MatchTier.FUZZY ? entry.fuzzyScore : 0,
        tier: entry.tier,
        matches: entry.matches,
    }))
}