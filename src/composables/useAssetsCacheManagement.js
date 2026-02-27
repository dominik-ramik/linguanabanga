import { ref, computed, watch, onScopeDispose, toRaw } from 'vue'
import { useStorage } from '@vueuse/core'

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

    function updateQueueSizeMB() {
        lastKnownQueueSizeMB.value = (queue.value || []).reduce((s, a) => s + (a.size || 0), 0) / 1024 / 1024;
    }

    const swAvailable = ('serviceWorker' in navigator)

    // --- Auto Offline Ready toggle (persisted to localStorage via useStorage) ---
    const autoOfflineReady = useStorage('autoOfflineReady', false, localStorage)

    // --- Helper: send a message to the service worker ---
    // Use JSON round-trip to strip Vue reactive proxies (which can't be structured-cloned by postMessage)
    function sendToSW(msgType, extra = {}) {
        if (!swAvailable) return;
        try {
            const rawProjects = JSON.parse(JSON.stringify(toRaw(selectedProjects.value) || []));
            const rawAssets = JSON.parse(JSON.stringify(toRaw(preloadableAssets.value) || []));
            try { console.log('[SW-client] sendToSW', msgType, { projects: rawProjects.length, assets: rawAssets.length, autoOfflineReady: autoOfflineReady.value }); } catch (e) { }
            navigator.serviceWorker.ready.then((registration) => {
                if (registration && registration.active) {
                    registration.active.postMessage({
                        type: msgType,
                        selectedProjects: rawProjects,
                        preloadableAssets: rawAssets,
                        languageVersion: langCode.value,
                        autoOfflineReady: autoOfflineReady.value,
                        ...extra
                    });
                }
            }).catch(e => console.error('[SW-client] sendToSW navigator.serviceWorker.ready failed', e));
        } catch (ex) {
            console.log("Error sending " + msgType + " to SW", ex);
        }
    }

    // --- Watch selectedProjects AND preloadableAssets ---
    // immediate: true so that after a page refresh the SW is told to resume
    watch(
        [() => selectedProjects.value, () => preloadableAssets.value],
        ([projects, assets]) => {
            if (!assets?.length) return; // dictionary data not loaded yet
            try { console.log('[SW-client] projects/assets watcher fired', { projects: Array.isArray(projects) ? projects.length : 0, assets: assets?.length || 0 }); } catch (e) { }
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
        (newVal) => {
            console.log('[SW-client] autoOfflineReady toggled ->', newVal);
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

        let result = (preloadableAssets.value || []).filter((asset) => {
            if (!(langCode.value in asset.refs)) {
                return false
            }

            if (!asset.refs[langCode.value]?.some(item => selectedProjects.value.includes(item))) {
                return false
            }

            if (currentlyCachedAssetsAsSet.has(asset.path)) {
                return false
            }

            return true
        });

        return result
    }

    async function getCachedAssets() {
        if (!swAvailable) return;
        try {
            try { console.log('[SW-client] requesting GET_CACHED_ASSETS'); } catch (e) { }
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
            console.log('[SW-client] initialAssetsLoadingInterval timed out after', MAX_POLLING_ATTEMPTS, 'seconds');
            return;
        }
        getCachedAssets()
    }, 1000) : null
    if (swAvailable) try { console.log('[SW-client] initialAssetsLoadingInterval started'); } catch (e) { }

    // Listen for SW messages via navigator.serviceWorker (Clients API)
    // This is more reliable than MessagePort which can become stale on page refresh
    function handleSWMessage(event) {
        if (!event.data?.type) return;
        try { console.log('[SW-client] received', event.data.type); } catch (e) { }
        switch (event.data.type) {
            case "CACHED_ASSETS":
                clearInterval(initialAssetsLoadingInterval)
                console.log('[SW-client] CACHED_ASSETS: SW returned', event.data.assets?.length, 'URLs, preloadableAssets available:', !!preloadableAssets.value?.length);
                currentlyCachedAssets.value = event.data.assets.map(url =>
                    preloadableAssets.value?.find((asset => asset.path === url))
                );
                const matchedCount = currentlyCachedAssets.value.filter(Boolean).length;
                console.log('[SW-client] CACHED_ASSETS: matched', matchedCount, 'of', event.data.assets?.length, 'URLs to preloadable assets');
                if (matchedCount === 0 && event.data.assets?.length > 0) {
                    console.warn('[SW-client] CACHED_ASSETS: PATH MISMATCH — sample SW URLs:', event.data.assets.slice(0, 3), 'sample asset paths:', preloadableAssets.value?.slice(0, 3).map(a => a.path));
                }
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
                updateQueueSizeMB();
                break;
            case "DATA_ASSETS_CLEARED":
                currentlyCachedAssets.value = []
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
                updateQueueSizeMB();
                break;
            case "NG_CACHE_INITIATED":
                queueBeingProcessed.value = true;
                storageFull.value = false;
                break;
            case "NG_CACHE_PROGRESS":
                queueBeingProcessed.value = true; // also set here in case we joined mid-caching after page reload
                downloadProgressRaw.value = ((event.data.processed || 0) / (event.data.total || 1)) * 100;
                if ((event.data.processed || 0) > 0 && (event.data.processed === event.data.total)) {
                    getCachedAssets();
                }
                break;
            case "NG_CACHE_COMPLETED":
                queueBeingProcessed.value = false;
                queueLengthBeforeProcessed.value = 0;
                downloadProgressRaw.value = 100;
                getCachedAssets();
                break;
            case "NG_CACHE_INCOMPLETE":
                queueBeingProcessed.value = false;
                getCachedAssets();
                break;
            case "NG_CACHE_STORAGE_FULL":
                queueBeingProcessed.value = false;
                storageFull.value = true;
                console.error("SW reported storage full during caching");
                getCachedAssets();
                break;
            case "CACHE_ASSETS_PROGRESS":
                downloadProgressRaw.value = event.data.progress || 0;
                currentlyCachedAssets.value = (event.data.cached || []).map(url =>
                    preloadableAssets.value?.find((asset => asset.path === url))
                );
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

    if (swAvailable) {
        navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    // Cleanup on scope disposal
    onScopeDispose(() => {
        if (swAvailable) {
            navigator.serviceWorker.removeEventListener('message', handleSWMessage);
        }
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

    return {
        queue,
        autoOfflineReady,
        downloadProgress,
        currentlyCachedAssets,
        requiredDownloadSize,
        queueBeingProcessed,
        storageFull,
    }
}
