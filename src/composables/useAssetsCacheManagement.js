import { ref, computed, watch } from 'vue'
import { useGlobalMessageChannel } from '@/composables/useGlobalMessageChannel.js';

export function useAssetsCacheManagement(langCodeRef, selectedProjectsRef, preloadableAssetsRef) {

    const langCode = ref(langCodeRef)
    const selectedProjects = ref(selectedProjectsRef)
    const preloadableAssets = ref(preloadableAssetsRef)

    const currentlyCachedAssets = ref(null)

    const processQueue = ref(false)
    const queueBeingProcessed = ref(false)

    const queue = ref([])
    const queueLengthBeforeProcessed = ref(0)

    const mc = useGlobalMessageChannel(); // { port1, port2 }

    // Read user's toggle for auto offline ready from localStorage (default true)
    function getAutoOfflineReadyFromStorage() {
        const v = localStorage.getItem('autoOfflineReady');
        if (v === null) return true;
        return v === 'true';
    }

    watch(
        () => selectedProjects.value,
        () => {
            // Always ask SW to run discovery/reconciliation when projects change
            try {
                navigator.serviceWorker.ready.then((registration) => {
                    if (registration && registration.active) {
                        registration.active.postMessage({
                            type: "NG_PROJECTS_CHANGED",
                            selectedProjects: selectedProjects.value,
                            preloadableAssets: preloadableAssets.value,
                            languageVersion: langCode.value
                        }); // <-- removed transfer of mc.port2
                    }
                });
            } catch (ex) {
                // fallback: attempt to get cached assets locally
            }

            if (currentlyCachedAssets.value == null) {
                getCachedAssets()
            }
            else {
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
            }
        }
    )

    watch(
        () => processQueue.value,
        (newValue) => {
            if (newValue == true) {
                if (queue.value.length > 0 && !queueBeingProcessed.value) {
                    // Initiate processing of the queue via NG_CACHE_ASSETS message
                    downloadQueuedAssets()
                }
            }
            else {
                // Halt processing: request SW to cancel if possible
                try {
                    navigator.serviceWorker.ready.then((registration) => {
                        if (registration && registration.active) {
                            registration.active.postMessage({ type: "NG_NETWORK_OFFLINE" }); // removed transfer
                            // Note: NG_NETWORK_OFFLINE used to ask SW to gracefully cancel current caching.
                        }
                    });
                } catch (ex) { /* ignore */ }
            }
        }
    )

    const parallelism = 10

    async function downloadQueuedAssets() {
        queueLengthBeforeProcessed.value = queue.value.length
        queueBeingProcessed.value = true;

        // Send the NG_CACHE_ASSETS request to the service worker
        try {
            navigator.serviceWorker.ready.then((registration) => {
                if (registration && registration.active) {
                    registration.active.postMessage({
                        type: "NG_CACHE_ASSETS",
                        selectedProjects: selectedProjects.value,
                        preloadableAssets: preloadableAssets.value,
                        languageVersion: langCode.value
                    }); // removed transfer of mc.port2
                }
            });
        } catch (ex) {
            console.log("Error sending NG_CACHE_ASSETS to SW", ex);
        }
    }

    function allNeededAssets() {
        const currentlyCachedAssetsAsSet = new Set(currentlyCachedAssets.value == null ? [] : currentlyCachedAssets.value.map(i => i.path))

        let result = preloadableAssets.value.filter((asset) => {
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
        try {
            navigator.serviceWorker.ready.then((registration) => {
                if (registration && registration.active) {
                    registration.active.postMessage({
                        type: "GET_CACHED_ASSETS",
                    }); // removed transfer of mc.port2
                }
            });
        } catch (ex) {
            console.log("Error getting cached assets", ex);
        }
    }

    let initialAssetsLoadingInterval = setInterval(() => {
        getCachedAssets()
    }, 1000)

    //Listen to messages from SW via global message channel
    mc.port1.onmessage = function (message) {
        // Process message
        switch (message.data.type) {
            case "CACHED_ASSETS":
                clearInterval(initialAssetsLoadingInterval)

                console.log("Got assets")
                currentlyCachedAssets.value = message.data.assets.map(url =>
                    preloadableAssets.value.find((asset => asset.path === url))
                );
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
                break;
            case "DATA_ASSETS_CLEARED":
                currentlyCachedAssets.value = []
                queue.value = allNeededAssets()
                queueLengthBeforeProcessed.value = queue.value.length
                break;
            case "NG_CACHE_INITIATED":
                // Discovery started
                queueBeingProcessed.value = true;
                break;
            case "NG_CACHE_PROGRESS":
                // { processed, total }
                downloadProgress.value = ((message.data.processed || 0) / (message.data.total || 1)) * 100;
                // Try to update currentlyCachedAssets from processed count (best-effort: request GET_CACHED_ASSETS if necessary)
                if ((message.data.processed || 0) > 0 && (message.data.processed === message.data.total)) {
                    // finished
                    navigator.serviceWorker.ready.then((registration) => {
                        if (registration && registration.active) {
                            // IMPORTANT: do NOT transfer the MessagePort again — use the already-initialized channel
                            registration.active.postMessage({ type: "GET_CACHED_ASSETS" });
                        }
                    });
                }
                break;
            case "NG_CACHE_COMPLETED":
                queueBeingProcessed.value = false;
                processQueue.value = false;
                queueLengthBeforeProcessed.value = 0;
                getCachedAssets();
                break;
            case "NG_CACHE_INCOMPLETE":
                queueBeingProcessed.value = false;
                // leave processQueue as-is so user can retry later
                getCachedAssets();
                break;
            case "NG_CACHE_STORAGE_FULL":
                queueBeingProcessed.value = false;
                processQueue.value = false;
                console.error("SW reported storage full during caching");
                break;
            case "CACHE_ASSETS_PROGRESS":
                // legacy message
                downloadProgress.value = message.data.progress;
                currentlyCachedAssets.value = message.data.cached.map(url =>
                    preloadableAssets.value.find((asset => asset.path === url))
                );
                break;
            case "CACHE_ASSETS_DONE":
                queueBeingProcessed.value = false;
                processQueue.value = false;
                queueLengthBeforeProcessed.value = 0;
                getCachedAssets();
                break;
            default:
                console.log(message.data);
                break;
        }
    };

    const downloadProgress = computed(() => {
        // use stored raw value if present else fallback
        return typeof (downloadProgressRaw.value) === 'number' ? downloadProgressRaw.value : (100 - 100 * (queue.value.length / queueLengthBeforeProcessed.value || 1))
    })

    // raw reactive to be updated from messages
    const downloadProgressRaw = ref(0);

    const requiredDownloadSize = computed(() => {
        if (!queue?.value) {
            return 0
        }

        let size = 0

        queue.value.forEach(asset => {
            size += asset.size
        })

        size = size / 1024 / 1024;
        return size
    });

    return {
        queue,
        processQueue,
        downloadProgress: downloadProgressRaw,
        currentlyCachedAssets,
        requiredDownloadSize,
    }
}
