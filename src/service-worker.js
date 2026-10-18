import { createHandlerBoundToURL, precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { version } from '@/../package.json'
import { normalizeURLPathname } from '@/utils/normalizeURLPathname.js'
import { AdaptiveConcurrency } from '@/utils/AdaptiveConcurrency.js'

const ACTIVE_ASSETS_CACHE = "data-assets"; // keep legacy name for compatibility
const STALE_ASSETS_CACHE = "stale-assets";
const DATA_JSON_CACHE = "data-json";
const OTHER_ASSETS_CACHE = "other-assets";
const GOOGLE_APIS_CACHE = "google-apis";
const DEMOTED_AT_HEADER = "x-ln-demoted-at"; // set on entries moved to the stale cache; the janitor ages them from this moment

const VERSION = version;
console.log("version", VERSION);

/*
 * Offline asset caching – design summary
 * --------------------------------------
 *  - The page sends the list of required assets (NG_PROJECTS_CHANGED / NG_CACHE_ASSETS). `reconcile` moves cache entries
 *    between the active and stale caches, prunes the persisted todo list to what is still required and starts ONE download run.
 *  - A run is a sliding window of requests (concurrency tuned by AdaptiveConcurrency) over an in-memory todo list that is
 *    mirrored to IndexedDB in bulk (only so a killed service worker can resume).
 *  - A run never gives up while the page is open:
 *      transient failures (network error, timeout, 5xx, 408/425/429/503) -> per-item retry with exponential backoff;
 *      3 transient failures in a row -> "outage": pause, then probe with a single request until it succeeds;
 *      Retry-After is honoured; offline -> pause until the 'online' event / next heartbeat;
 *      an item that keeps failing is parked and retried in later passes (20 s, 1 min, 3 min, 5 min later);
 *      404/410 (and repeated odd 4xx / HTML-instead-of-media answers) mark the file "missing": reported, not fatal, not
 *      re-requested for an hour.
 *  - Every run ends in exactly one terminal message (COMPLETED / INCOMPLETE / STORAGE_FULL) unless it was superseded by a
 *    newer reconcile, so the UI can never be left "preparing" forever.
 *  - The page heartbeat (NG_CACHE_PING) keeps the worker alive during long downloads and lets it ask for the config again
 *    (NG_CACHE_NEED_CONFIG) if the browser killed it.
 */

// Tunables. `self.LN_CACHE_TUNING` exists only so tests can shorten the timers.
const TUNING = Object.assign({
    maxConcurrencyH1: 6,              // browsers open at most 6 connections per host on HTTP/1.1
    maxConcurrency: 32,
    initialConcurrency: 8,
    maxItemAttempts: 8,               // transient failures of one item before it is parked for a later pass
    suspectAttempts: 3,               // odd 4xx / HTML-instead-of-media answers before the file is declared missing
    itemRetryBaseMs: 400,
    itemRetryMaxMs: 15000,
    outageAfterConsecutive: 3,        // consecutive transient failures of distinct files that switch to single-probe mode
    outageBackoffStartMs: 1000,
    outageBackoffMaxMs: 30000,
    retryAfterMaxMs: 120000,
    retryPassWaitsMs: [20000, 60000, 180000, 300000],
    requestTimeoutBaseMs: 60000,
    requestTimeoutMsPerByte: 0.2,     // = assume at least 5 KB/s for one request
    offlinePollMs: 20000,
    progressIntervalMs: 250,
    persistEvery: 50,
    persistIntervalMs: 1000,
    missingRetryMs: 60 * 60 * 1000,
    exhaustedCooldownMs: 10 * 60 * 1000,
    keepAliveMs: 70000,                 // each heartbeat holds the worker alive for up to this long (covers throttled background-tab timers)
    janitorMaxAgeDays: 7,
    janitorEveryMs: 60 * 60 * 1000,
    moveConcurrency: 8,
}, self.LN_CACHE_TUNING || {});

// Claim clients immediately so messages work on very first page load
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------------------------------
let networkOnline = (typeof navigator === 'undefined' || navigator.onLine !== false);
let config = null;               // last config received from the page: {selectedProjects, languageVersion, preloadableAssets, autoOfflineReady, protocol, sig}
let activeRun = null;            // the one download run, if any
let runCounter = 0;
let reconcileGeneration = 0;     // newest requested reconcile; older queued ones are coalesced away
let reconcilePending = 0;
let reconcileChain = Promise.resolve();
let exhaustedAt = 0;             // when the last run ended with failures; heartbeats do not restart it for a while
let lastJanitorAt = 0;
let communicationPort = null;    // for app <-> sw messaging (legacy; messages are broadcast through the Clients API)

function sameProjects(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
}

function isOnline() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    return networkOnline;
}

function assetsSignature(assets) {
    let total = 0;
    for (const a of assets) total += a.size || 0;
    return assets.length + ':' + total + ':' + (assets[0]?.path || '') + ':' + (assets[assets.length - 1]?.path || '');
}

// Helpers to post messages — use Clients API for reliability
// (MessagePort can become stale after page refresh)
function postToApp(msg) {
    try {
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            for (const client of clients) {
                try { client.postMessage(msg); } catch (e) { console.error('[SW] postToApp client.postMessage failed', e); }
            }
        }).catch((e) => { console.error('[SW] postToApp clients.matchAll failed', e); });
    } catch (e) {
        // ignore
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Persistent todo list (IndexedDB). One connection, bulk writes. The in-memory map is the working copy.
// Records: { path, size, missingAt? }   (missingAt = ms timestamp of the last 404/410 for that file)
// ---------------------------------------------------------------------------------------------------------------------
const IDB_DB_NAME = 'lingua-cache-db';
const IDB_STORE = 'todo-assets';

let dbPromise = null;
function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: 'path' });
            }
        };
        req.onsuccess = () => {
            const db = req.result;
            db.onclose = () => { dbPromise = null; };
            db.onversionchange = () => { db.close(); dbPromise = null; };
            resolve(db);
        };
        req.onerror = () => { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
}

async function idbGetAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function idbWrite(puts, deletes) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        for (const rec of puts) store.put(rec);
        for (const path of deletes) store.delete(path);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

const todoMap = new Map();       // path -> record
let todoLoaded = false;
const pendingPuts = new Map();   // path -> record, not yet written to IndexedDB
const pendingDeletes = new Set();
let persistChain = Promise.resolve();
let persistTimer = null;

async function loadTodo() {
    if (todoLoaded) return;
    try {
        for (const r of await idbGetAll()) todoMap.set(r.path, { path: r.path, size: r.size || 0, missingAt: r.missingAt || 0 });
    } catch (e) {
        console.error('[SW] could not read todo list from IndexedDB (continuing with an empty list)', e);
    }
    todoLoaded = true;
}

function todoPut(rec) {
    todoMap.set(rec.path, rec);
    pendingDeletes.delete(rec.path);
    pendingPuts.set(rec.path, rec);
    schedulePersist();
}

function todoRemove(path) {
    if (!todoMap.delete(path) && !pendingPuts.has(path)) return;
    pendingPuts.delete(path);
    pendingDeletes.add(path);
    schedulePersist();
}

function schedulePersist() {
    if (pendingPuts.size + pendingDeletes.size >= TUNING.persistEvery) { flushTodo(); return; }
    if (!persistTimer) persistTimer = setTimeout(() => { persistTimer = null; flushTodo(); }, TUNING.persistIntervalMs);
}

function flushTodo() {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    persistChain = persistChain.then(async () => {
        if (!pendingPuts.size && !pendingDeletes.size) return;
        const puts = [...pendingPuts.values()];
        const deletes = [...pendingDeletes];
        pendingPuts.clear();
        pendingDeletes.clear();
        try { await idbWrite(puts, deletes); }
        catch (e) { console.error('[SW] persisting todo list failed (non-fatal; reconcile recomputes it)', e); }
    });
    return persistChain;
}

function isRecentlyMissing(rec, now = Date.now()) {
    return rec.missingAt && now - rec.missingAt < TUNING.missingRetryMs;
}

function pendingRecords() {
    const now = Date.now();
    return [...todoMap.values()].filter((r) => !isRecentlyMissing(r, now));
}

function missingRecords() {
    const now = Date.now();
    return [...todoMap.values()].filter((r) => isRecentlyMissing(r, now));
}

// ---------------------------------------------------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------------------------------------------------
function withHeader(res, name, value) {
    const headers = new Headers(res.headers);
    headers.set(name, value);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Move a cached entry between two already-open cache handles (streams the body, no buffering).
// Uses the original Request object as the key to guarantee an exact match on put/delete.
async function moveCacheEntry(srcCache, dstCache, request, stampDemotion) {
    try {
        const res = await srcCache.match(request);
        if (!res) return false;
        await dstCache.put(request, stampDemotion ? withHeader(res, DEMOTED_AT_HEADER, String(Date.now())) : res);
        return await srcCache.delete(request);
    } catch (e) {
        console.error('[SW] moveCacheEntry error for', request.url || request, e);
        return false;
    }
}

async function mapLimit(items, limit, fn, shouldStop) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            if (shouldStop && shouldStop()) return;
            await fn(items[next++]);
        }
    });
    await Promise.all(workers);
}

// Janitor: remove stale assets that were demoted more than maxAgeDays ago.
// Age counts from the demotion (header), NOT from the download date. Legacy entries without the header get a full grace period.
async function janitorTask(maxAgeDays = TUNING.janitorMaxAgeDays) {
    try {
        const staleCache = await caches.open(STALE_ASSETS_CACHE);
        const requests = await staleCache.keys();
        const now = Date.now();
        for (const req of requests) {
            try {
                const res = await staleCache.match(req);
                if (!res) continue;
                const demotedAt = Number(res.headers.get(DEMOTED_AT_HEADER));
                if (!demotedAt) {
                    await staleCache.put(req, withHeader(res, DEMOTED_AT_HEADER, String(now)));
                    continue;
                }
                if (now - demotedAt > maxAgeDays * 24 * 3600 * 1000) {
                    await staleCache.delete(req);
                }
            } catch (e) {
                // ignore entry errors
            }
        }
    } catch (e) {
        // ignore janitor failures
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Download run
// ---------------------------------------------------------------------------------------------------------------------
function jitter(ms) { return ms * (0.8 + 0.4 * Math.random()); }

function parseRetryAfter(value) {
    if (!value) return 0;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.min(Math.max(0, seconds * 1000), TUNING.retryAfterMaxMs);
    const date = Date.parse(value);
    return Number.isNaN(date) ? 0 : Math.min(Math.max(0, date - Date.now()), TUNING.retryAfterMaxMs);
}

function isQuotaError(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message || ''));
}

// Static hosts with an SPA fallback answer a missing file with index.html and status 200. Never cache that as audio/image.
function looksLikeHtmlFallback(path, res) {
    const type = res.headers.get('content-type') || '';
    return /^text\/html/i.test(type) && !/\.html?$/i.test(path.split('?')[0]);
}

function maxConcurrencyFor(protocol) {
    return /^http\/1/i.test(protocol || '') ? TUNING.maxConcurrencyH1 : TUNING.maxConcurrency;
}

function wakeRun(run) {
    if (run && run.wake) run.wake();
}

function sleepInterruptible(run, ms) {
    return new Promise((resolve) => {
        let timer = null;
        const done = () => { if (timer) clearTimeout(timer); run.wake = null; resolve(); };
        if (ms !== Infinity) timer = setTimeout(done, Math.max(0, ms));
        run.wake = done;
    });
}

function emitProgress(run, force) {
    const now = Date.now();
    if (!force && now - run.lastProgressAt < TUNING.progressIntervalMs) return;
    run.lastProgressAt = now;
    postToApp({
        type: 'NG_CACHE_PROGRESS',
        processed: run.processed + run.missing.size,   // "settled" items: cached or reported missing
        total: run.total,
        bytesDone: run.bytesDone,
        bytesTotal: run.bytesTotal,
        failed: run.failed.size,
        retrying: run.delayed.length,
        missing: run.missing.size,
        concurrency: run.ctl ? Math.min(run.ctl.limit, run.maxConcurrency) : 0,
        phase: run.phase,
    });
}

async function fetchAndStore(run, item, cache) {
    const ac = new AbortController();
    let timedOut = false;
    const onRunAbort = () => ac.abort();
    run.abort.signal.addEventListener('abort', onRunAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; ac.abort(); },
        TUNING.requestTimeoutBaseMs + (item.size || 0) * TUNING.requestTimeoutMsPerByte);
    try {
        const res = await fetch(item.path, { signal: ac.signal });
        if (!res.ok) {
            return { kind: 'http', status: res.status, retryAfterMs: parseRetryAfter(res.headers.get('retry-after')) };
        }
        if (looksLikeHtmlFallback(item.path, res)) {
            return { kind: 'badcontent' };
        }
        // put() streams the body into the cache and rejects if the body breaks off, so nothing partial is ever stored
        await cache.put(item.path, res);
        return { kind: 'ok' };
    } catch (e) {
        if (isQuotaError(e)) return { kind: 'quota' };
        if (run.cancelled) return { kind: 'cancelled' };
        return { kind: timedOut ? 'timeout' : 'network', error: e };
    } finally {
        clearTimeout(timer);
        run.abort.signal.removeEventListener('abort', onRunAbort);
    }
}

function markMissing(run, item) {
    run.missing.add(item.path);
    const rec = todoMap.get(item.path) || { path: item.path, size: item.size || 0 };
    todoPut({ path: rec.path, size: rec.size, missingAt: Date.now() });
}

function scheduleItemRetry(run, item, delayMs) {
    run.delayed.push({ at: Date.now() + delayMs, item });
}

function resetStreak(run) {
    run.failStreak.clear();
    run.consec = 0;
    run.backoffMs = 0;
}

function handleOutcome(run, item, out) {
    const ctl = run.ctl;
    const now = Date.now();

    if (out.kind === 'ok') {
        run.processed++;
        run.bytesDone += item.size || 0;
        resetStreak(run);
        ctl.recordSuccess(item.size || 1, now);
        todoRemove(item.path);
        emitProgress(run, false);
        return;
    }
    if (out.kind === 'cancelled') return;
    if (out.kind === 'quota') {
        run.storageFull = true;
        run.cancelled = true;
        run.cancelReason = 'storage-full';
        run.abort.abort();
        return;
    }

    // The server answered, so the connection works: a missing file is not an outage.
    if (out.kind === 'http' && (out.status === 404 || out.status === 410)) {
        resetStreak(run);
        ctl.recordNeutral(now);
        markMissing(run, item);
        emitProgress(run, false);
        return;
    }
    // Other 4xx (400/401/403/451…) or HTML instead of media: probably a permanent problem with this file, but allow a few retries
    // (a WAF rate-limit or a captive portal looks the same for a moment).
    const suspect = out.kind === 'badcontent' ||
        (out.kind === 'http' && out.status >= 400 && out.status < 500 && ![408, 425, 429].includes(out.status));
    if (suspect) {
        ctl.recordNeutral(now);
        item.suspect++;
        if (item.suspect >= TUNING.suspectAttempts) markMissing(run, item);
        else scheduleItemRetry(run, item, 1500 * item.suspect);
        emitProgress(run, false);
        return;
    }

    // Transient failure: network error, timeout, 408/425/429, 5xx.
    const status = out.kind === 'http' ? out.status : 0;
    const hard = status === 429 || status === 503;
    ctl.recordError(hard ? String(status) : out.kind === 'http' ? '5xx' : out.kind, now);
    // An outage means failures across several DIFFERENT files in a row. One stubborn file must not look like an outage,
    // otherwise its attempts would never run out.
    run.failStreak.add(item.path);
    run.consec = run.failStreak.size;
    const outage = run.consec >= TUNING.outageAfterConsecutive;
    if (out.retryAfterMs) run.pauseUntil = Math.max(run.pauseUntil, now + out.retryAfterMs);
    if (outage && (now >= run.pauseUntil || !run.backoffMs)) {
        // escalate once per pause window (a burst of failures from requests that were already in flight counts once)
        run.backoffMs = run.backoffMs ? Math.min(TUNING.outageBackoffMaxMs, run.backoffMs * 2) : TUNING.outageBackoffStartMs;
        run.pauseUntil = Math.max(run.pauseUntil, now + jitter(run.backoffMs));
    }
    if (outage) {
        // blame the connection/server, not the file: requeue without burning the item's attempts
        run.queue.push(item);
    } else {
        item.attempts++;
        if (item.attempts >= TUNING.maxItemAttempts) run.failed.add(item);
        else scheduleItemRetry(run, item, jitter(Math.min(TUNING.itemRetryMaxMs, TUNING.itemRetryBaseMs * 2 ** (item.attempts - 1))));
    }
    emitProgress(run, false);
}

function launch(run, item, cache) {
    run.inflight++;
    (async () => {
        let out;
        try { out = await fetchAndStore(run, item, cache); }
        catch (e) { out = { kind: 'network', error: e }; }
        run.inflight--;
        try { handleOutcome(run, item, out); } catch (e) { console.error('[SW] handleOutcome failed', e); }
        wakeRun(run);
    })();
}

async function runDownload(run) {
    const cache = await caches.open(ACTIVE_ASSETS_CACHE);
    const max = run.maxConcurrency;
    const ctl = new AdaptiveConcurrency({ min: 2, max, initial: Math.min(TUNING.initialConcurrency, max) });
    ctl.reset(Date.now());
    run.ctl = ctl;
    let passIdx = 0;
    emitProgress(run, true);

    while (!run.cancelled) {
        if (typeof navigator !== 'undefined' && navigator.onLine === true) networkOnline = true;
        const now = Date.now();

        // release retries that are due
        for (let i = run.delayed.length - 1; i >= 0; i--) {
            if (run.delayed[i].at <= now) run.queue.push(run.delayed.splice(i, 1)[0].item);
        }
        const outage = run.consec >= TUNING.outageAfterConsecutive;
        run.phase = !isOnline() ? 'offline' : (now < run.pauseUntil || outage) ? 'backoff' : 'running';

        if (!run.queue.length && !run.delayed.length && run.inflight === 0) {
            if (!run.failed.size) break;                                         // everything is cached or reported missing
            if (passIdx >= TUNING.retryPassWaitsMs.length) { run.exhausted = true; break; }
            run.phase = 'waiting-retry';
            emitProgress(run, true);
            await sleepInterruptible(run, TUNING.retryPassWaitsMs[passIdx++]);    // wakes early on cancel / online
            if (run.cancelled) break;
            for (const item of run.failed) { item.attempts = 0; run.queue.push(item); }
            run.failed.clear();
            resetStreak(run); run.pauseUntil = 0;
            continue;
        }

        if (isOnline() && now >= run.pauseUntil) {
            const limit = outage ? 1 : Math.min(ctl.limit, max);                 // outage: a single probe request
            while (run.inflight < limit && run.queue.length) launch(run, run.queue.shift(), cache);
        }
        emitProgress(run, false);

        let wait = Infinity;
        if (run.delayed.length) wait = Math.min(wait, Math.min(...run.delayed.map((d) => d.at)) - now);
        if (run.pauseUntil > now) wait = Math.min(wait, run.pauseUntil - now);
        if (!isOnline()) wait = Math.min(wait, TUNING.offlinePollMs);
        if (wait === Infinity && run.inflight === 0) wait = 1000;                // safety net, should not happen
        await sleepInterruptible(run, wait);
    }

    // let aborted / finishing requests settle so nothing writes to the cache after the run is over
    while (run.inflight > 0) await sleepInterruptible(run, 100);
}

async function finalizeRun(run) {
    await flushTodo();
    if (activeRun === run) activeRun = null;
    if (run.cancelReason === 'superseded') return;                  // a newer reconcile owns the UI state now

    const missing = missingRecords();
    const base = {
        total: run.total, processed: run.processed, failed: run.failed.size,
        missing: missing.length, missingPaths: missing.slice(0, 20).map((r) => r.path),
    };
    if (run.storageFull) {
        postToApp({ type: 'NG_CACHE_STORAGE_FULL', ...base });
    } else if (run.crashed) {
        exhaustedAt = Date.now();
        postToApp({ type: 'NG_CACHE_INCOMPLETE', reason: 'error', ...base });
    } else if (run.cancelReason) {
        postToApp({ type: 'NG_CACHE_INCOMPLETE', reason: run.cancelReason, ...base });
    } else if (run.exhausted || run.failed.size) {
        exhaustedAt = Date.now();
        postToApp({ type: 'NG_CACHE_INCOMPLETE', reason: 'failed', ...base });
    } else {
        postToApp({ type: 'NG_CACHE_COMPLETED', ...base });
    }
}

function startRun() {
    if (activeRun) return activeRun;
    const items = pendingRecords().map((r) => ({ path: r.path, size: r.size || 0, attempts: 0, suspect: 0 }));
    if (!items.length) return null;

    const run = {
        id: ++runCounter,
        abort: new AbortController(),
        cancelled: false, cancelReason: '', storageFull: false, exhausted: false, crashed: false,
        items,
        queue: items.slice(),
        delayed: [],
        failed: new Set(),
        missing: new Set(),
        inflight: 0, consec: 0, failStreak: new Set(), backoffMs: 0, pauseUntil: 0,
        processed: 0, total: items.length,
        bytesDone: 0, bytesTotal: items.reduce((s, i) => s + i.size, 0),
        maxConcurrency: maxConcurrencyFor(config && config.protocol),
        ctl: null, wake: null, lastProgressAt: 0, phase: 'running',
    };
    activeRun = run;
    run.promise = (async () => {
        try { await runDownload(run); }
        catch (e) { console.error('[SW] download run crashed', e); run.crashed = true; }
        finally { await finalizeRun(run); }
    })();
    return run;
}

function cancelActiveRun(reason) {
    const run = activeRun;
    if (!run || run.cancelled) return run;
    run.cancelled = true;
    run.cancelReason = reason;
    run.abort.abort();
    wakeRun(run);
    return run;
}

// ---------------------------------------------------------------------------------------------------------------------
// Reconcile: align the caches and the todo list with the current selection, then start (or resume) the download run.
// ---------------------------------------------------------------------------------------------------------------------
function enqueueReconcile(reason) {
    const gen = ++reconcileGeneration;
    reconcilePending++;
    cancelActiveRun('superseded');
    reconcileChain = reconcileChain.then(async () => {
        try {
            if (gen !== reconcileGeneration) return;                 // coalesced into a newer request
            if (activeRun) await activeRun.promise;
            if (gen !== reconcileGeneration) return;
            await doReconcile(gen, reason);
        } catch (e) {
            console.error('[SW] reconcile failed', e);
            postToApp({ type: 'NG_CACHE_INCOMPLETE', reason: 'error' });
        } finally {
            reconcilePending--;
        }
    });
    return reconcileChain;
}

async function doReconcile(gen, reason) {
    const cfg = config;
    if (!cfg) return;
    const superseded = () => gen !== reconcileGeneration;
    postToApp({ type: 'NG_CACHE_INITIATED', reason });

    const { selectedProjects, languageVersion, preloadableAssets, autoOfflineReady } = cfg;

    // required asset paths for the current selection & language
    const requiredSet = new Set();
    const requiredAssets = [];
    for (const asset of preloadableAssets) {
        const refs = asset.refs && asset.refs[languageVersion];
        if (!Array.isArray(refs)) continue;
        if (refs.some((r) => selectedProjects.includes(r))) {
            requiredSet.add(asset.path);
            requiredAssets.push(asset);
        }
    }

    // Safety guard: projects selected but nothing required (e.g. language mismatch, or a text-only dictionary):
    // do not demote anything. Nothing to download either, so report completion instead of leaving the UI waiting.
    if (selectedProjects.length > 0 && requiredSet.size === 0) {
        postToApp({ type: 'NG_CACHE_COMPLETED', total: 0, processed: 0, failed: 0, missing: 0, missingPaths: [], note: 'no-assets' });
        return;
    }

    const active = await caches.open(ACTIVE_ASSETS_CACHE);
    const stale = await caches.open(STALE_ASSETS_CACHE);
    const pathOf = (r) => new URL(r.url).pathname;
    const activeRequests = await active.keys();
    const staleRequests = await stale.keys();

    // Promote stale -> active if required, demote active -> stale if not (bounded parallelism, original Request objects as keys)
    const toPromote = staleRequests.filter((r) => requiredSet.has(pathOf(r)));
    const toDemote = activeRequests.filter((r) => !requiredSet.has(pathOf(r)));
    await mapLimit(toPromote, TUNING.moveConcurrency, (r) => moveCacheEntry(stale, active, r, false), superseded);
    await mapLimit(toDemote, TUNING.moveConcurrency, (r) => moveCacheEntry(active, stale, r, true), superseded);
    if (superseded()) return;

    const activePaths = new Set((await active.keys()).map(pathOf));

    // Align the persisted todo list with reality: drop what is no longer required or is already cached, add what is missing.
    await loadTodo();
    for (const path of [...todoMap.keys()]) {
        if (!requiredSet.has(path) || activePaths.has(path)) todoRemove(path);
    }
    if (autoOfflineReady) {
        for (const asset of requiredAssets) {
            if (!activePaths.has(asset.path) && !todoMap.has(asset.path)) todoPut({ path: asset.path, size: asset.size || 0, missingAt: 0 });
        }
    }
    await flushTodo();
    if (superseded()) return;

    // discovery finished; janitor runs at most once per janitorEveryMs, non-blocking
    if (Date.now() - lastJanitorAt > TUNING.janitorEveryMs) {
        lastJanitorAt = Date.now();
        janitorTask().catch(() => { /* ignore */ });
    }

    if (!autoOfflineReady) {
        postToApp({ type: 'NG_CACHE_INCOMPLETE', reason: 'disabled', total: 0, processed: 0, failed: 0, missing: 0, missingPaths: [] });
        return;
    }

    exhaustedAt = 0;   // an explicit reconcile always gets a fresh set of attempts
    if (!startRun()) {
        const missing = missingRecords();
        postToApp({ type: 'NG_CACHE_COMPLETED', total: 0, processed: 0, failed: 0, missing: missing.length, missingPaths: missing.slice(0, 20).map((r) => r.path) });
    }
}

// Keeps the worker alive while there is work (each heartbeat/config message extends its lifetime a little).
function keepAliveWhileBusy(maxMs = TUNING.keepAliveMs) {
    return new Promise((resolve) => {
        const started = Date.now();
        const iv = setInterval(() => {
            if ((!activeRun && !reconcilePending) || Date.now() - started > maxMs) { clearInterval(iv); resolve(); }
        }, 250);
    });
}

function applyConfig(msg) {
    const prev = config;
    const next = {
        selectedProjects: Array.isArray(msg.selectedProjects) ? msg.selectedProjects.slice() : (prev ? prev.selectedProjects : []),
        languageVersion: msg.languageVersion || (prev ? prev.languageVersion : ''),
        preloadableAssets: Array.isArray(msg.preloadableAssets) ? msg.preloadableAssets : (prev ? prev.preloadableAssets : []),
        autoOfflineReady: msg.autoOfflineReady !== false,
        protocol: msg.protocol || (prev ? prev.protocol : ''),
    };
    next.sig = assetsSignature(next.preloadableAssets);
    config = next;
    if (typeof msg.online === 'boolean') networkOnline = msg.online;
    return !prev ||
        !sameProjects(prev.selectedProjects, next.selectedProjects) ||
        prev.languageVersion !== next.languageVersion ||
        prev.sig !== next.sig ||
        prev.autoOfflineReady !== next.autoOfflineReady;
}

// ---------------------------------------------------------------------------------------------------------------------
// Messages from the page
// ---------------------------------------------------------------------------------------------------------------------
self.addEventListener('message', function (message) {
    const msg = message.data || {};

    // Initialize comms port
    if (msg.type === 'PORT_INITIALIZATION') {
        communicationPort = message.ports[0];
        postToApp({ type: 'PORT_READY' });
        return;
    }

    // The page asks the waiting worker to take over: the user pressed "Reload" in the update prompt, or a page was loaded while
    // an update was waiting (see useServiceWorkerUpdate.js). The page reloads when it sees the controllerchange.
    if (msg.type === 'SKIP_WAITING') {
        self.skipWaiting();
        window.location.reload();   // the page is still controlled by the old worker, so reload it to get the new one
        return;
    }

    // Requests for list of cached assets
    if (msg.type === "GET_CACHED_ASSETS") {
        message.waitUntil(
            caches.open(ACTIVE_ASSETS_CACHE).then(async (cache) => {
                const keys = await cache.keys();
                const urls = keys.map(k => normalizeURLPathname(location.origin, k.url));
                postToApp({ type: 'CACHED_ASSETS', assets: urls });
            }).catch(e => console.error('GET_CACHED_ASSETS error', e))
        );
        return;
    }

    // Clear active data assets
    if (msg.type === "CLEAR_DATA_ASSETS") {
        cancelActiveRun('superseded');
        message.waitUntil(
            (activeRun ? activeRun.promise : Promise.resolve())
                .then(() => caches.delete(ACTIVE_ASSETS_CACHE))
                .then(() => { postToApp({ type: 'DATA_ASSETS_CLEARED' }); })
                .catch(e => console.error('CLEAR_DATA_ASSETS error', e))
        );
        return;
    }

    // Full config from the page: new selection, new data, auto-offline toggle, or an explicit request
    if (msg.type === 'NG_CACHE_ASSETS' || msg.type === 'NG_PROJECTS_CHANGED') {
        const changed = applyConfig(msg);
        if (msg.type === 'NG_CACHE_ASSETS' || changed) {
            enqueueReconcile(msg.type);
        } else if (activeRun) {
            emitProgress(activeRun, true);                      // nothing changed: just resync the page
        }
        message.waitUntil(keepAliveWhileBusy());
        return;
    }

    // Light heartbeat while the page waits for the download (also re-syncs online state, keeps the worker alive)
    if (msg.type === 'NG_CACHE_PING') {
        if (typeof msg.online === 'boolean') networkOnline = msg.online;
        if (!config) {
            postToApp({ type: 'NG_CACHE_NEED_CONFIG' });       // the browser restarted this worker: ask for the config again
            return;
        }
        if (msg.protocol) config.protocol = msg.protocol;
        if (activeRun) {
            wakeRun(activeRun);
            emitProgress(activeRun, true);
        } else if (config.autoOfflineReady && !reconcilePending && (!todoLoaded || pendingRecords().length > 0) &&
            Date.now() - exhaustedAt > TUNING.exhaustedCooldownMs) {
            enqueueReconcile('resume');
        }
        message.waitUntil(keepAliveWhileBusy());
        return;
    }

    // Network state messages
    if (msg.type === 'NG_NETWORK_ONLINE') {
        networkOnline = true;
        if (activeRun) {
            wakeRun(activeRun);
        } else if (!config) {
            postToApp({ type: 'NG_CACHE_NEED_CONFIG' });
        } else if (config.autoOfflineReady && !reconcilePending && (!todoLoaded || pendingRecords().length > 0)) {
            exhaustedAt = 0;
            enqueueReconcile('online');
        }
        message.waitUntil(keepAliveWhileBusy());
        return;
    } else if (msg.type === 'NG_NETWORK_OFFLINE') {
        networkOnline = false;                                  // the run pauses by itself, it is NOT cancelled
        if (activeRun) wakeRun(activeRun);
        return;
    }
});

cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(
    createHandlerBoundToURL('index.html'),
));

registerRoute(({ url }) => {
    return url.pathname.endsWith("/data/data.json");
}, new StaleWhileRevalidate(
    {
        cacheName: DATA_JSON_CACHE,
        cacheableResponse: {
            statuses: [200],
        },
    }
));

registerRoute(({ url, request, event }) => {
    return url.pathname.startsWith("/") && !url.pathname.startsWith("/data");
}, new CacheFirst(
    {
        cacheName: OTHER_ASSETS_CACHE,
        cacheableResponse: {
            statuses: [200],
        },
    }
));

registerRoute(({ url, request, event }) => {
    return url.pathname.startsWith("/data/") && !url.pathname.endsWith("/data.json");
}, async ({ request }) => {
    // Check pre-cached data-assets first (offline-ready items)
    try {
        const activeCache = await caches.open(ACTIVE_ASSETS_CACHE);
        const activeResp = await activeCache.match(request);
        if (activeResp) return activeResp;
    } catch (e) { /* fall through */ }

    // Then check data-json cache (regular CacheFirst behaviour)
    try {
        const jsonCache = await caches.open(DATA_JSON_CACHE);
        const jsonResp = await jsonCache.match(request);
        if (jsonResp) return jsonResp;

        // Not in any cache — fetch from network and store in data-json
        const networkResp = await fetch(request);
        if (networkResp.ok) {
            jsonCache.put(request, networkResp.clone());
        }
        return networkResp;
    } catch (e) {
        // if fetch also fails, return a basic error response
        return new Response('Network error', { status: 503, statusText: 'Service Unavailable' });
    }
});

registerRoute('https://fonts.googleapis.com/(.*)',
    new CacheFirst({
        cacheName: GOOGLE_APIS_CACHE,
        cacheExpiration: {
            maxEntries: 30
        },
        cacheableResponse: { statuses: [0, 200] }
    })
);
