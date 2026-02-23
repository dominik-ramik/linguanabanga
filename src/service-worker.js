import { createHandlerBoundToURL, precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { version } from '@/../package.json'
import { normalizeURLPathname } from '@/utils/normalizeURLPathname.js'

const ACTIVE_ASSETS_CACHE = "data-assets"; // keep legacy name for compatibility
const STALE_ASSETS_CACHE = "stale-assets";
const DATA_JSON_CACHE = "data-json";
const OTHER_ASSETS_CACHE = "other-assets";
const GOOGLE_APIS_CACHE = "google-apis";

const VERSION = version;
console.log("version", VERSION);

// Claim clients immediately so messages work on very first page load
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Simple SW state machine & control flags
let cachingState = 'IDLE'; // 'IDLE' | 'DISCOVERING' | 'CACHING' | 'CANCELLING'
let cancelRequested = false;
let networkOnline = true;
let selectedProjects = [];
let languageVersion = '';
let currentPreloadableAssets = [];

// Module-level progress so handlers can report status without cancelling
let cachingProcessed = 0;
let cachingTotal = 0;

let communicationPort = null; // for app <-> sw messaging
let currentCacheAbortController = null;
let reconcileRunning = false; // re-entrancy guard for reconcile

// Compare two project arrays (order-insensitive)
function sameProjects(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
}

// Minimal IndexedDB wrapper to store todo assets (paths + metadata)
const IDB_DB_NAME = 'lingua-cache-db';
const IDB_STORE = 'todo-assets';
function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: 'path' });
            }
        }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function getAllTodo() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}
async function putTodos(items) {
    if (!items || items.length === 0) return;
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        items.forEach(i => store.put(i));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
async function deleteTodo(path) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.delete(path);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}
async function clearAllTodo() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// Helpers to post messages — use Clients API for reliability
// (MessagePort can become stale after page refresh)
function postToApp(msg) {
    try {
        try { console.log('[SW] postToApp ->', msg && msg.type ? msg.type : msg, "RAW", msg); } catch (e) { }
        self.clients.matchAll({ type: 'window' }).then(clients => {
            for (const client of clients) {
                try { client.postMessage(msg); } catch (e) { console.error('[SW] postToApp client.postMessage failed', e); }
            }
        }).catch((e) => { console.error('[SW] postToApp clients.matchAll failed', e); });
    } catch (e) {
        // ignore
    }
}

// Promote asset from stale to active (move entry)
async function promoteAssetToActive(path) {
    const staleCache = await caches.open(STALE_ASSETS_CACHE);
    const activeCache = await caches.open(ACTIVE_ASSETS_CACHE);
    try {
        const res = await staleCache.match(path);
        if (res) {
            await activeCache.put(path, res.clone());
            await staleCache.delete(path);
        }
    } catch (e) { /* ignore */ }
}

// Demote asset from active to stale
async function demoteAssetToStale(path) {
    const staleCache = await caches.open(STALE_ASSETS_CACHE);
    const activeCache = await caches.open(ACTIVE_ASSETS_CACHE);
    try {
        const res = await activeCache.match(path);
        if (res) {
            await staleCache.put(path, res.clone());
            await activeCache.delete(path);
        }
    } catch (e) { /* ignore */ }
}

// Janitor: remove stale assets older than maxAgeDays
async function janitorTask(maxAgeDays = 7) {
    try {
        const staleCache = await caches.open(STALE_ASSETS_CACHE);
        const requests = await staleCache.keys();
        const now = Date.now();
        for (const req of requests) {
            try {
                const res = await staleCache.match(req);
                if (!res) continue;
                const dateHeader = res.headers.get('date');
                if (!dateHeader) continue;
                const age = now - new Date(dateHeader).getTime();
                if (age > maxAgeDays * 24 * 3600 * 1000) {
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

// Reconcile: promote/demote & populate todo list (deduped)
// IMPORTANT: respect msgAutoOfflineReady flag. Discovery runs always, but adding to todo & starting caching only when autoOfflineReady === true
async function reconcile(preloadableAssets, selProjects, langVer, port, msgAutoOfflineReady = true) {
    if (reconcileRunning) {
        console.warn('[SW] reconcile SKIPPED — already running');
        return;
    }
    reconcileRunning = true;
    cachingState = 'DISCOVERING';
    console.log('[SW] reconcile START', { projects: selProjects?.length, langVer, autoOfflineReady: msgAutoOfflineReady });
    postToApp({ type: 'NG_CACHE_INITIATED' });
  try {

    // compute required asset paths for current selection & language
    const requiredSet = new Set();
    preloadableAssets.forEach(asset => {
        const refs = asset.refs && asset.refs[langVer];
        if (!Array.isArray(refs)) return;
        if (refs.some(r => selProjects.includes(r))) {
            requiredSet.add(asset.path);
        }
    });

    // get keys from active and stale
    const active = await caches.open(ACTIVE_ASSETS_CACHE);
    const stale = await caches.open(STALE_ASSETS_CACHE);
    const activeKeys = (await active.keys()).map(k => new URL(k.url).pathname);
    const staleKeys = (await stale.keys()).map(k => new URL(k.url).pathname);
    console.log('[SW] reconcile initial state: active=' + activeKeys.length + ', stale=' + staleKeys.length + ', requiredSet=' + requiredSet.size);

    // Promote from stale -> active if required
    let promoted = 0;
    for (const path of staleKeys) {
        if (requiredSet.has(path)) {
            await promoteAssetToActive(path);
            promoted++;
        }
    }
    console.log('[SW] reconcile promoted from stale -> active:', promoted);

    // Demote active->stale if not required
    let demoted = 0;
    for (const path of activeKeys) {
        if (!requiredSet.has(path)) {
            await demoteAssetToStale(path);
            demoted++;
        }
    }
    console.log('[SW] reconcile demoted active -> stale:', demoted);

    // Determine required assets not present in active
    const updatedActiveKeys = (await active.keys()).map(k => new URL(k.url).pathname);
    console.log('[SW] reconcile after promote/demote: active=' + updatedActiveKeys.length);
    const toAdd = [];
    for (const asset of preloadableAssets) {
        if (requiredSet.has(asset.path) && !updatedActiveKeys.includes(asset.path)) {
            toAdd.push({ path: asset.path, size: asset.size || 0, refs: asset.refs || {} });
        }
    }

    // Put missing required assets into IndexedDB todo list (dedupe)
    if (msgAutoOfflineReady) {
        const existingTodo = await getAllTodo();
        const existingPaths = new Set(existingTodo.map(i => i.path));
        const newTodos = toAdd.filter(a => !existingPaths.has(a.path));
        if (newTodos.length > 0) {
            console.log('[SW] reconcile adding to todo:', newTodos.length);
            await putTodos(newTodos);
        } else {
            console.log('[SW] reconcile no new todo items');
        }
    } else {
        console.log('[SW] reconcile autoOfflineReady disabled — skipping todo insertion');
    }

    // discovery finished
    cachingState = 'IDLE';
    console.log('[SW] reconcile DONE', { toAdd: toAdd.length });

    // after discovery: run janitor (non-blocking)
    janitorTask().catch(() => { /* ignore */ });

    // if network is online and there are todo items, start caching (only if autoOfflineReady is enabled)
    const todoNow = await getAllTodo();
    console.log('[SW] reconcile todoNow count:', todoNow.length);
    if (msgAutoOfflineReady && networkOnline && todoNow.length > 0) {
        await startCachingProcess(port);
        // Post-caching verification
        const verifyCache = await caches.open(ACTIVE_ASSETS_CACHE);
        const verifyKeys = await verifyCache.keys();
        console.log('[SW] POST-CACHING VERIFICATION: data-assets has', verifyKeys.length, 'entries');
    } else if (todoNow.length > 0 && !networkOnline) {
        postToApp({ type: 'NG_CACHE_INCOMPLETE' });
    } else if (todoNow.length === 0) {
        // Everything already cached — notify app so UI resets
        console.log('[SW] reconcile: all required assets already cached');
        postToApp({ type: 'NG_CACHE_COMPLETED' });
    }
  } finally {
    reconcileRunning = false;
  }
}

// Start the caching process (processing phase) — reads IndexedDB todo list
async function startCachingProcess(port) {
    if (cachingState === 'CACHING' || cachingState === 'DISCOVERING') return;
    const todo = await getAllTodo();
    if (!todo || todo.length === 0) {
        console.log('[SW] startCachingProcess: nothing to do');
        postToApp({ type: 'NG_CACHE_COMPLETED' });
        return;
    }

    cachingState = 'CACHING';
    cancelRequested = false;

    // create abort controller for fetches
    if (currentCacheAbortController) {
        try { currentCacheAbortController.abort(); } catch (e) { }
    }
    currentCacheAbortController = new AbortController();
    const signal = currentCacheAbortController.signal;

    // Open the cache once for the entire run (avoids repeated caches.open overhead)
    const activeCache = await caches.open(ACTIVE_ASSETS_CACHE);

    cachingTotal = todo.length;
    cachingProcessed = 0;
    postToApp({ type: 'NG_CACHE_PROGRESS', processed: cachingProcessed, total: cachingTotal });

    const concurrency = 6;
    let consecutiveFailedBatches = 0;

    try {
        while (true) {
            if (cancelRequested) {
                // leave remaining todo in IDB and gracefully stop
                cancelRequested = false;
                cachingState = 'IDLE';
                console.log('[SW] startCachingProcess: cancelled by request');
                postToApp({ type: 'NG_CACHE_INCOMPLETE' });
                return;
            }

            const remaining = await getAllTodo();
            if (!remaining || remaining.length === 0) {
                cachingState = 'IDLE';
                postToApp({ type: 'NG_CACHE_COMPLETED' }, port);
                return;
            }

            // take a batch
            const batch = remaining.slice(0, concurrency);
            const fetches = batch.map(item => fetch(item.path, { signal }).then(async (res) => {
                if (!res.ok) {
                    const err = new Error('bad-status');
                    err.status = res.status;
                    throw err;
                }
                // store into active cache (reuse handle opened before the loop)
                await activeCache.put(item.path, res.clone());
                // remove from todo DB
                await deleteTodo(item.path);
                cachingProcessed++;
            }));

            // execute batch
            try {
                await Promise.all(fetches);
                consecutiveFailedBatches = 0;
            } catch (err) {
                // Detect quota exceeded inside batch
                if (err && (err.name === 'QuotaExceededError' || err.code === 22 || (err.message && err.message.includes('quota')))) {
                    console.error('[SW] QuotaExceededError in batch', err);
                    postToApp({ type: 'NG_CACHE_STORAGE_FULL' });
                    cachingState = 'IDLE';
                    return;
                }
                // classify failures: network / status 404 / quota
                // For each item in batch: try HEAD to detect 404; if 404 => delete from todo; otherwise keep
                for (const item of batch) {
                    try {
                        const r = await fetch(item.path, { method: 'HEAD' });
                        if (r.status === 404) {
                            await deleteTodo(item.path);
                        }
                    } catch (e) {
                        // network error => keep in todo
                    }
                }
                consecutiveFailedBatches++;
                if (consecutiveFailedBatches >= 3) {
                    // abandon caching for now
                    cachingState = 'IDLE';
                    console.error('[SW] consecutiveFailedBatches >= 3, abandoning caching');
                    postToApp({ type: 'NG_CACHE_INCOMPLETE' });
                    return;
                }
            }

            // progress update every loop
            postToApp({ type: 'NG_CACHE_PROGRESS', processed: cachingProcessed, total: cachingTotal });

            // small idle to allow cancellation checks
            await new Promise(r => setTimeout(r, 50));
        }
    } catch (e) {
        // handle quota exceeded explicitly
        if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
            // inform app
            console.error('[SW] QuotaExceededError while caching', e);
            postToApp({ type: 'NG_CACHE_STORAGE_FULL' });
            cachingState = 'IDLE';
            return;
        }
        // other errors: set state to IDLE and notify incomplete
        cachingState = 'IDLE';
        console.error('[SW] startCachingProcess failed', e);
        postToApp({ type: 'NG_CACHE_INCOMPLETE' });
    } finally {
        // cleanup
        if (currentCacheAbortController) {
            try { currentCacheAbortController.abort(); } catch (e) { }
            currentCacheAbortController = null;
        }
    }
}

// Message handling (single handler for the state-machine)
self.addEventListener('message', function (message) {
    const msg = message.data || {};
    // Initialize comms port
    if (msg.type === 'PORT_INITIALIZATION') {
        communicationPort = message.ports[0];
        // respond with ack
        postToApp({ type: 'PORT_READY' }, message.ports[0]);
        return;
    }

    // Requests for list of cached assets (compat)
    if (msg.type === "GET_CACHED_ASSETS") {
        message.waitUntil(
            caches.open(ACTIVE_ASSETS_CACHE).then(async (cache) => {
                const keys = await cache.keys();
                const urls = keys.map(k => normalizeURLPathname(location.origin, k.url));
                console.log('[SW] GET_CACHED_ASSETS: data-assets has', keys.length, 'entries');
                postToApp({ type: 'CACHED_ASSETS', assets: urls });
            }).catch(e => console.error('GET_CACHED_ASSETS error', e))
        );
        return;
    }

    // Clear active data assets (compat)
    if (msg.type === "CLEAR_DATA_ASSETS") {
        message.waitUntil(
            caches.delete(ACTIVE_ASSETS_CACHE).then(() => {
                postToApp({ type: 'DATA_ASSETS_CLEARED' });
            }).catch(e => console.error('CLEAR_DATA_ASSETS error', e))
        );
        return;
    }

    // NG_CACHE_ASSETS: run full discovery/reconcile; message may include autoOfflineReady flag
    if (msg.type === 'NG_CACHE_ASSETS') {
        selectedProjects = Array.isArray(msg.selectedProjects) ? msg.selectedProjects.slice() : [];
        languageVersion = msg.languageVersion || '';
        currentPreloadableAssets = Array.isArray(msg.preloadableAssets) ? msg.preloadableAssets : [];
        const msgAutoOfflineReady = msg.autoOfflineReady !== false;

        if (cachingState === 'CACHING' || cachingState === 'DISCOVERING') {
            cancelRequested = true;
            cachingState = 'CANCELLING';
            if (currentCacheAbortController) {
                try { currentCacheAbortController.abort(); } catch (e) { }
            }
            message.waitUntil(
                (async () => {
                    const start = Date.now();
                    while ((cachingState !== 'IDLE' || reconcileRunning) && (Date.now() - start) < 10000) {
                        await new Promise(r => setTimeout(r, 200));
                    }
                    await reconcile(currentPreloadableAssets, selectedProjects, languageVersion, null, msgAutoOfflineReady);
                })().catch(e => console.error('NG_CACHE_ASSETS reconcile error', e))
            );
        } else {
            message.waitUntil(
                reconcile(currentPreloadableAssets, selectedProjects, languageVersion, null, msgAutoOfflineReady)
                    .catch(e => console.error('NG_CACHE_ASSETS reconcile error', e))
            );
        }
        return;
    }

    // Network state messages
    if (msg.type === 'NG_NETWORK_ONLINE') {
        networkOnline = true;
        message.waitUntil(
            (async () => {
                const todo = await getAllTodo();
                if (cachingState === 'IDLE' && todo.length > 0) {
                    await startCachingProcess(null);
                }
            })().catch(e => console.error('NG_NETWORK_ONLINE error', e))
        );
        return;
    } else if (msg.type === 'NG_NETWORK_OFFLINE') {
        networkOnline = false;
        if (cachingState === 'CACHING') {
            cancelRequested = true;
            if (currentCacheAbortController) {
                try { currentCacheAbortController.abort(); } catch (e) { }
            }
        }
        return;
    }

    // Project changes triggered by app
    if (msg.type === 'NG_PROJECTS_CHANGED') {
        const incomingProjects = Array.isArray(msg.selectedProjects) ? msg.selectedProjects.slice() : selectedProjects;
        const incomingLangVer = msg.languageVersion || languageVersion;
        const incomingAssets = Array.isArray(msg.preloadableAssets) ? msg.preloadableAssets : currentPreloadableAssets;
        const msgAutoOfflineReady = msg.autoOfflineReady !== false;

        const projectsSame = sameProjects(incomingProjects, selectedProjects);
        const langSame = incomingLangVer === languageVersion;

        // Update stored values
        selectedProjects = incomingProjects;
        languageVersion = incomingLangVer;
        currentPreloadableAssets = incomingAssets;

        // If projects & language haven't changed and caching is already running, just report progress
        if (projectsSame && langSame && (cachingState === 'CACHING' || cachingState === 'DISCOVERING')) {
            console.log('[SW] NG_PROJECTS_CHANGED: same projects/lang, caching continues (' + cachingProcessed + '/' + cachingTotal + ')');
            postToApp({ type: 'NG_CACHE_PROGRESS', processed: cachingProcessed, total: cachingTotal });
            return;
        }

        if (cachingState === 'CACHING' || cachingState === 'DISCOVERING') {
            console.log('[SW] NG_PROJECTS_CHANGED: projects/lang changed, cancelling current caching');
            cancelRequested = true;
            cachingState = 'CANCELLING';
            if (currentCacheAbortController) {
                try { currentCacheAbortController.abort(); } catch (e) { }
            }
            message.waitUntil(
                (async () => {
                    const start = Date.now();
                    while ((cachingState !== 'IDLE' || reconcileRunning) && (Date.now() - start) < 10000) {
                        await new Promise(r => setTimeout(r, 200));
                    }
                    await reconcile(currentPreloadableAssets, selectedProjects, languageVersion, null, msgAutoOfflineReady);
                })().catch(e => console.error('NG_PROJECTS_CHANGED reconcile error', e))
            );
        } else {
            message.waitUntil(
                reconcile(currentPreloadableAssets, selectedProjects, languageVersion, null, msgAutoOfflineReady)
                    .catch(e => console.error('NG_PROJECTS_CHANGED reconcile error', e))
            );
        }
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