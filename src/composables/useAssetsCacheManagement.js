import { ref, computed, watch, onScopeDispose, toRaw } from 'vue'
import { useStorage } from '@vueuse/core'

const HEARTBEAT_MS = 10000

/**
 * Keeps the service worker informed about which assets must be available offline and mirrors its progress.
 *
 * Besides the original return values (queue, autoOfflineReady, downloadProgress, currentlyCachedAssets,
 * requiredDownloadSize, queueBeingProcessed, storageFull) it now exposes:
 *   summary        – { state, processed, total, failed, missing, retrying, concurrency, reason, missingPaths }
 *                    state: idle | discovering | running | backoff | offline | waiting-retry | complete | incomplete | storage-full
 *   isOfflineReady – true when the service worker reported every required asset cached (none failed, none missing)
 */
export function useAssetsCacheManagement(langCodeRef, selectedProjectsRef, preloadableAssetsRef) {

    const langCode = ref(langCodeRef)
    const selectedProjects = ref(selectedProjectsRef)
    const preloadableAssets = ref(preloadableAssetsRef)

    const currentlyCachedAssets = ref(null)
    const queueBeingProcessed = ref(false)
    const storageFull = ref(false)

    const queue = ref([])
    const queueLengthBeforeProcessed = ref(0)
    const downloadProgressRaw = ref(0)
    const lastKnownQueueSizeMB = ref(0)

    const summary = ref({
        state: 'idle', processed: 0, total: 0, failed: 0, missing: 0, retrying: 0, concurrency: 0, reason: '', missingPaths: [],
    })

    function updateQueueSizeMB() {
        lastKnownQueueSizeMB.value = (queue.value || []).reduce((s, a) => s + (a.size || 0), 0) / 1024 / 1024;
    }

    const swAvailable = ('serviceWorker' in navigator)

    // --- Auto Offline Ready toggle (persisted to localStorage via useStorage) ---
    const autoOfflineReady = useStorage('autoOfflineReady', false, localStorage)

    // path -> asset, rebuilt only when the asset list changes (the SW reports cached files as URL paths)
    const assetsByPath = computed(() => {
        const map = new Map()
        for (const asset of preloadableAssets.value || []) map.set(asset.path, asset)
        return map
    })

    // The HTTP protocol the server speaks decides how many parallel downloads make sense (HTTP/1.1: 6, HTTP/2+: many).
    function detectProtocol() {
        try {
            const nav = performance.getEntriesByType('navigation')[0]
            if (nav && nav.nextHopProtocol) return nav.nextHopProtocol
            const res = performance.getEntriesByType('resource').find((e) => e.nextHopProtocol)
            if (res) return res.nextHopProtocol
        } catch (e) { /* ignore */ }
        return ''
    }

    // Only the assets the current selection needs are sent (the SW does not need the rest).
    function requiredAssetsForSW() {
        const lang = langCode.value
        const selected = new Set(toRaw(selectedProjects.value) || [])
        return (toRaw(preloadableAssets.value) || []).filter((asset) => {
            const refs = asset.refs && asset.refs[lang]
            return Array.isArray(refs) && refs.some((r) => selected.has(r))
        })
    }

    // --- Helper: send a message to the service worker ---
    // Use JSON round-trip to strip Vue reactive proxies (which can't be structured-cloned by postMessage)
    function sendToSW(msgType, extra = {}) {
        if (!swAvailable) return;
        try {
            const rawProjects = JSON.parse(JSON.stringify(toRaw(selectedProjects.value) || []));
            const rawAssets = JSON.parse(JSON.stringify(requiredAssetsForSW()));
            navigator.serviceWorker.ready.then((registration) => {
                if (registration && registration.active) {
                    registration.active.postMessage({
                        type: msgType,
                        selectedProjects: rawProjects,
                        preloadableAssets: rawAssets,
                        languageVersion: langCode.value,
                        autoOfflineReady: autoOfflineReady.value,
                        online: navigator.onLine,
                        protocol: detectProtocol(),
                        ...extra
                    });
                }
            }).catch(e => console.error('[SW-client] sendToSW navigator.serviceWorker.ready failed', e));
        } catch (ex) {
            console.log("Error sending " + msgType + " to SW", ex);
        }
    }

    // Light message: no asset list. Keeps the service worker alive and in sync while a download is pending.
    function pingSW() {
        if (!swAvailable) return;
        navigator.serviceWorker.ready.then((registration) => {
            if (registration && registration.active) {
                registration.active.postMessage({
                    type: 'NG_CACHE_PING',
                    autoOfflineReady: autoOfflineReady.value,
                    online: navigator.onLine,
                    protocol: detectProtocol(),
                });
            }
        }).catch(() => { /* ignore */ });
    }

    // --- Watch selectedProjects AND preloadableAssets ---
    // immediate: true so that after a page refresh the SW is told to resume
    watch(
        [() => selectedProjects.value, () => preloadableAssets.value],
        ([projects, assets]) => {
            if (!assets?.length) return; // dictionary data not loaded yet
            sendToSW("NG_PROJECTS_CHANGED");

            if (currentlyCachedAssets.value == null) {
                getCachedAssets()
            } else {
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
                updateQueueSizeMB();
            }
        },
        { immediate: true }
    )

    // --- Watch autoOfflineReady toggle ---
    watch(
        () => autoOfflineReady.value,
        () => {
            if (!preloadableAssets.value?.length) return;
            // Trigger full reconcile; the SW respects the autoOfflineReady flag
            // to decide whether to actually download or just promote/demote.
            sendToSW("NG_CACHE_ASSETS");
        }
    )

    function allNeededAssets() {
        const currentlyCachedAssetsAsSet = new Set(
            currentlyCachedAssets.value == null
                ? []
                : currentlyCachedAssets.value.filter(Boolean).map(i => i.path)
        )
        const selected = new Set(selectedProjects.value || [])

        return (preloadableAssets.value || []).filter((asset) => {
            const refs = asset.refs && asset.refs[langCode.value]
            if (!refs) return false
            if (!refs.some(item => selected.has(item))) return false
            if (currentlyCachedAssetsAsSet.has(asset.path)) return false
            return true
        });
    }

    async function getCachedAssets() {
        if (!swAvailable) return;
        try {
            navigator.serviceWorker.ready.then((registration) => {
                if (registration && registration.active) {
                    registration.active.postMessage({
                        type: "GET_CACHED_ASSETS",
                    });
                }
            }).catch(e => console.error('[SW-client] getCachedAssets navigator.serviceWorker.ready failed', e));
        } catch (ex) {
            console.log("Error getting cached assets", ex);
        }
    }

    let pollingAttempts = 0;
    const MAX_POLLING_ATTEMPTS = 20; // 20 seconds max
    let initialAssetsLoadingInterval = swAvailable ? setInterval(() => {
        pollingAttempts++;
        if (pollingAttempts >= MAX_POLLING_ATTEMPTS) {
            clearInterval(initialAssetsLoadingInterval);
            return;
        }
        getCachedAssets()
    }, 1000) : null

    function setSummary(patch) {
        summary.value = { ...summary.value, ...patch }
    }

    // Listen for SW messages via navigator.serviceWorker (Clients API)
    // This is more reliable than MessagePort which can become stale on page refresh
    function handleSWMessage(event) {
        const data = event.data
        if (!data?.type) return;
        switch (data.type) {
            case "CACHED_ASSETS": {
                clearInterval(initialAssetsLoadingInterval)
                // O(n) lookups: this used to be assets.find() per cached URL (O(n*m), hundreds of ms on the UI thread for 10k assets)
                const byPath = assetsByPath.value
                currentlyCachedAssets.value = data.assets.map(url => byPath.get(url));
                const matchedCount = currentlyCachedAssets.value.filter(Boolean).length;
                if (matchedCount === 0 && data.assets?.length > 0) {
                    console.warn('[SW-client] CACHED_ASSETS: PATH MISMATCH — sample SW URLs:', data.assets.slice(0, 3), 'sample asset paths:', preloadableAssets.value?.slice(0, 3).map(a => a.path));
                }
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
                updateQueueSizeMB();
                break;
            }
            case "DATA_ASSETS_CLEARED":
                currentlyCachedAssets.value = []
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
                updateQueueSizeMB();
                break;
            case "NG_CACHE_NEED_CONFIG":
                // the browser restarted the service worker and it lost its state: send everything again
                sendToSW("NG_PROJECTS_CHANGED");
                break;
            case "NG_CACHE_INITIATED":
                // The service worker is only checking what is missing. That is NOT a download, so the progress bar and the
                // app-bar circle stay hidden; the first NG_CACHE_PROGRESS (a real run) turns them on.
                storageFull.value = false;
                setSummary({ state: 'discovering', reason: '' });
                break;
            case "NG_CACHE_PROGRESS":
                if (!queueBeingProcessed.value) downloadProgressRaw.value = 0; // a fresh run starts from 0
                queueBeingProcessed.value = true; // a real download is running (also covers joining mid-caching after a page reload)
                downloadProgressRaw.value = ((data.processed || 0) / (data.total || 1)) * 100;
                setSummary({
                    state: data.phase || 'running', processed: data.processed || 0, total: data.total || 0,
                    failed: data.failed || 0, missing: data.missing || 0, retrying: data.retrying || 0,
                    concurrency: data.concurrency || 0, reason: '',
                });
                if ((data.processed || 0) > 0 && (data.processed === data.total)) {
                    getCachedAssets();
                }
                break;
            case "NG_CACHE_COMPLETED":
                queueBeingProcessed.value = false;
                queueLengthBeforeProcessed.value = 0;
                downloadProgressRaw.value = 100;
                setSummary({
                    state: 'complete', processed: data.processed || 0, total: data.total || 0, failed: 0,
                    missing: data.missing || 0, missingPaths: data.missingPaths || [], retrying: 0, concurrency: 0, reason: data.note || '',
                });
                getCachedAssets();
                break;
            case "NG_CACHE_INCOMPLETE":
                queueBeingProcessed.value = false;
                setSummary({
                    state: 'incomplete', processed: data.processed || 0, total: data.total || 0, failed: data.failed || 0,
                    missing: data.missing || 0, missingPaths: data.missingPaths || [], retrying: 0, concurrency: 0, reason: data.reason || '',
                });
                getCachedAssets();
                break;
            case "NG_CACHE_STORAGE_FULL":
                queueBeingProcessed.value = false;
                storageFull.value = true;
                console.error("SW reported storage full during caching");
                setSummary({ state: 'storage-full', failed: data.failed || 0, missing: data.missing || 0, reason: 'storage-full', concurrency: 0 });
                getCachedAssets();
                break;
            case "CACHE_ASSETS_PROGRESS":
                downloadProgressRaw.value = data.progress || 0;
                currentlyCachedAssets.value = (data.cached || []).map(url => assetsByPath.value.get(url));
                break;
            case "CACHE_ASSETS_DONE":
                queueBeingProcessed.value = false;
                queueLengthBeforeProcessed.value = 0;
                getCachedAssets();
                break;
            default:
                break;
        }
    }

    // --- Heartbeat: while a download is pending, ping the SW (keeps it alive, re-syncs online state, lets it ask for the config again) ---
    let heartbeat = null
    function startHeartbeat() {
        if (heartbeat || !swAvailable) return
        pingSW()
        heartbeat = setInterval(pingSW, HEARTBEAT_MS)
    }
    function stopHeartbeat() {
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null }
    }
    watch(
        () => autoOfflineReady.value && summary.value.state !== 'complete' && summary.value.state !== 'storage-full' &&
            (queueBeingProcessed.value || queue.value.length > 0),
        (needed) => { needed ? startHeartbeat() : stopHeartbeat() },
        { immediate: true }
    )

    // coming back to the tab or regaining the connection is a good moment for an immediate resync
    function onVisibility() { if (document.visibilityState === 'visible' && heartbeat) pingSW() }
    function onOnline() { if (heartbeat) pingSW() }
    if (swAvailable && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('online', onOnline)
        navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    // Cleanup on scope disposal
    onScopeDispose(() => {
        if (swAvailable) {
            navigator.serviceWorker.removeEventListener('message', handleSWMessage);
            document.removeEventListener('visibilitychange', onVisibility)
            window.removeEventListener('online', onOnline)
        }
        stopHeartbeat()
        clearInterval(initialAssetsLoadingInterval);
    });

    const downloadProgress = computed(() => {
        return typeof downloadProgressRaw.value === 'number' ? downloadProgressRaw.value : 0;
    })

    const requiredDownloadSize = computed(() => {
        // During active caching, scale the last known queue size by remaining progress
        if (queueBeingProcessed.value && lastKnownQueueSizeMB.value > 0 && downloadProgressRaw.value > 0) {
            return lastKnownQueueSizeMB.value * (1 - downloadProgressRaw.value / 100);
        }
        return lastKnownQueueSizeMB.value;
    });

    const isOfflineReady = computed(() =>
        summary.value.state === 'complete' && summary.value.missing === 0 && summary.value.failed === 0)

    return {
        queue,
        autoOfflineReady,
        downloadProgress,
        currentlyCachedAssets,
        requiredDownloadSize,
        queueBeingProcessed,
        storageFull,
        summary,
        isOfflineReady,
    }
}
