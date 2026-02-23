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

// Simple SW state machine & control flags
let cachingState = 'IDLE'; // 'IDLE' | 'DISCOVERING' | 'CACHING' | 'CANCELLING'
let cancelRequested = false;
let networkOnline = true;
let selectedProjects = [];
let languageVersion = '';
let currentPreloadableAssets = [];

let communicationPort = null; // for app <-> sw messaging
let currentCacheAbortController = null;

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

// Helpers to post messages (use communicationPort when available)
function postToApp(msg, portFallback) {
    try {
        if (communicationPort) {
            communicationPort.postMessage(msg);
        } else if (portFallback) {
            portFallback.postMessage(msg);
        } else {
            // no-op
        }
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
    cachingState = 'DISCOVERING';
    postToApp({ type: 'NG_CACHE_INITIATED' }, port);

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

    // Promote from stale -> active if required
    for (const path of staleKeys) {
        if (requiredSet.has(path)) {
            await promoteAssetToActive(path);
        }
    }

    // Demote active->stale if not required
    for (const path of activeKeys) {
        if (!requiredSet.has(path)) {
            await demoteAssetToStale(path);
        }
    }

    // Determine required assets not present in active
    const updatedActiveKeys = (await active.keys()).map(k => new URL(k.url).pathname);
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
            await putTodos(newTodos);
        }
    }

    // discovery finished
    cachingState = 'IDLE';

    // after discovery: run janitor (non-blocking)
    janitorTask().catch(() => { /* ignore */ });

    // if network is online and there are todo items, start caching (only if autoOfflineReady is enabled)
    const todoNow = await getAllTodo();
    if (msgAutoOfflineReady && networkOnline && todoNow.length > 0) {
        startCachingProcess(port);
    } else if (todoNow.length > 0 && !networkOnline) {
        postToApp({ type: 'NG_CACHE_INCOMPLETE' }, port);
    }
}

// Start the caching process (processing phase) — reads IndexedDB todo list
async function startCachingProcess(port) {
    if (cachingState === 'CACHING' || cachingState === 'DISCOVERING') return;
    const todo = await getAllTodo();
    if (!todo || todo.length === 0) {
        postToApp({ type: 'NG_CACHE_COMPLETED' }, port);
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

    const total = todo.length;
    let processed = 0;
    postToApp({ type: 'NG_CACHE_PROGRESS', processed, total }, port);

    const concurrency = 6;
    let consecutiveFailedBatches = 0;

    try {
        while (true) {
            if (cancelRequested) {
                // leave remaining todo in IDB and gracefully stop
                cancelRequested = false;
                cachingState = 'IDLE';
                postToApp({ type: 'NG_CACHE_INCOMPLETE' }, port);
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
                // store into active cache
                const cache = await caches.open(ACTIVE_ASSETS_CACHE);
                await cache.put(item.path, res.clone());
                // remove from todo DB
                await deleteTodo(item.path);
                processed++;
            }));

            // execute batch
            try {
                await Promise.all(fetches);
                consecutiveFailedBatches = 0;
            } catch (err) {
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
                    postToApp({ type: 'NG_CACHE_INCOMPLETE' }, port);
                    return;
                }
            }

            // progress update every loop (SW will send frequent updates if needed)
            postToApp({ type: 'NG_CACHE_PROGRESS', processed, total }, port);

            // small idle to allow cancellation checks
            await new Promise(r => setTimeout(r, 200));
        }
    } catch (e) {
        // handle quota exceeded explicitly
        if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
            // inform app
            postToApp({ type: 'NG_CACHE_STORAGE_FULL' }, port);
            cachingState = 'IDLE';
            return;
        }
        // other errors: set state to IDLE and notify incomplete
        cachingState = 'IDLE';
        postToApp({ type: 'NG_CACHE_INCOMPLETE' }, port);
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
        // Return all active assets (paths)
        caches.open(ACTIVE_ASSETS_CACHE).then(async (cache) => {
            const keys = await cache.keys();
            const urls = keys.map(k => normalizeURLPathname(location.origin, k.url));
            postToApp({ type: 'CACHED_ASSETS', assets: urls }, message.ports && message.ports[0]);
        });
        return;
    }

    // Clear active data assets (compat)
    if (msg.type === "CLEAR_DATA_ASSETS") {
        caches.delete(ACTIVE_ASSETS_CACHE).then(() => {
            postToApp({ type: 'DATA_ASSETS_CLEARED' }, message.ports && message.ports[0]);
        });
        return;
    }

    // NG_CACHE_ASSETS: run full discovery/reconcile; message may include autoOfflineReady flag
    if (msg.type === 'NG_CACHE_ASSETS') {
        const port = message.ports && message.ports[0];
        selectedProjects = Array.isArray(msg.selectedProjects) ? msg.selectedProjects.slice() : [];
        languageVersion = msg.languageVersion || '';
        currentPreloadableAssets = Array.isArray(msg.preloadableAssets) ? msg.preloadableAssets : [];
        const msgAutoOfflineReady = msg.autoOfflineReady !== false; // default true if undefined

        // Cancel any ongoing caching if necessary
        if (cachingState === 'CACHING' || cachingState === 'DISCOVERING') {
            cancelRequested = true;
            cachingState = 'CANCELLING';
            if (currentCacheAbortController) {
                try { currentCacheAbortController.abort(); } catch (e) { }
            }
            (async () => {
                const start = Date.now();
                while (cachingState !== 'IDLE' && (Date.now() - start) < 10000) {
                    await new Promise(r => setTimeout(r, 200));
                }
                reconcile(currentPreloadableAssets, selectedProjects, languageVersion, port, msgAutoOfflineReady).catch(()=>{});
            })();
        } else {
            reconcile(currentPreloadableAssets, selectedProjects, languageVersion, port, msgAutoOfflineReady).catch(()=>{});
        }
        return;
    }

    // Network state messages
    if (msg.type === 'NG_NETWORK_ONLINE') {
        networkOnline = true;
        (async () => {
            const todo = await getAllTodo();
            if (cachingState === 'IDLE' && todo.length > 0) {
                startCachingProcess(message.ports && message.ports[0]);
            }
        })();
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
        selectedProjects = Array.isArray(msg.selectedProjects) ? msg.selectedProjects.slice() : selectedProjects;
        languageVersion = msg.languageVersion || languageVersion;
        currentPreloadableAssets = Array.isArray(msg.preloadableAssets) ? msg.preloadableAssets : currentPreloadableAssets;
        const msgAutoOfflineReady = msg.autoOfflineReady !== false;

        if (cachingState === 'CACHING' || cachingState === 'DISCOVERING') {
            cancelRequested = true;
            cachingState = 'CANCELLING';
            if (currentCacheAbortController) {
                try { currentCacheAbortController.abort(); } catch (e) { }
            }
            (async () => {
                const start = Date.now();
                while (cachingState !== 'IDLE' && (Date.now() - start) < 10000) {
                    await new Promise(r => setTimeout(r, 200));
                }
                reconcile(currentPreloadableAssets, selectedProjects, languageVersion, message.ports && message.ports[0], msgAutoOfflineReady).catch(()=>{});
            })();
        } else {
            reconcile(currentPreloadableAssets, selectedProjects, languageVersion, message.ports && message.ports[0], msgAutoOfflineReady).catch(()=>{});
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
}, new CacheFirst(
    {
        cacheName: DATA_JSON_CACHE, // keep data assets in data cache (non-preloadable) - existing behavior
        cacheableResponse: {
            statuses: [200],
        },
    }
));

registerRoute('https://fonts.googleapis.com/(.*)',
    new CacheFirst({
        cacheName: GOOGLE_APIS_CACHE,
        cacheExpiration: {
            maxEntries: 30
        },
        cacheableResponse: { statuses: [0, 200] }
    })
);